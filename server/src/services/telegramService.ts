import db from '../db/index.js';

// Telegram Bot Token - 从环境变量获取
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// 生成验证码
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 发送 Telegram 消息
export async function sendTelegramMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram bot token not configured');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json() as { ok: boolean; description?: string };
    if (!result.ok) {
      console.error('Telegram API error:', result);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

// 获取用户的 Telegram 绑定信息
export async function getUserTelegram(userId: number) {
  const result = await db.query<{
    id: number;
    user_id: number;
    telegram_chat_id: string;
    telegram_username: string | null;
    is_verified: boolean;
    notifications_enabled: boolean;
    created_at: Date;
  }>(
    'SELECT * FROM user_telegram WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// 创建或更新 Telegram 绑定（开始验证流程）
export async function initTelegramBinding(userId: number): Promise<{ code: string; expiresAt: Date }> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后过期

  await db.query(
    `INSERT INTO user_telegram (user_id, telegram_chat_id, verification_code, verification_expires_at, is_verified)
     VALUES ($1, '', $2, $3, false)
     ON CONFLICT (user_id) DO UPDATE SET
       verification_code = $2,
       verification_expires_at = $3,
       is_verified = false`,
    [userId, code, expiresAt]
  );

  return { code, expiresAt };
}

// 验证 Telegram 绑定（由 Telegram Bot Webhook 调用）
export async function verifyTelegramBinding(
  verificationCode: string,
  chatId: string,
  username: string | null
): Promise<{ success: boolean; userId?: number }> {
  // 查找匹配的验证码
  const result = await db.query<{ user_id: number }>(
    `UPDATE user_telegram
     SET telegram_chat_id = $2,
         telegram_username = $3,
         is_verified = true,
         verification_code = NULL,
         verification_expires_at = NULL
     WHERE verification_code = $1
       AND verification_expires_at > NOW()
       AND is_verified = false
     RETURNING user_id`,
    [verificationCode, chatId, username]
  );

  if (result.rows.length > 0) {
    return { success: true, userId: result.rows[0].user_id };
  }
  return { success: false };
}

// 解绑 Telegram
export async function unbindTelegram(userId: number): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM user_telegram WHERE user_id = $1',
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// 切换全局通知开关
export async function toggleGlobalNotifications(userId: number, enabled: boolean): Promise<boolean> {
  const result = await db.query(
    `UPDATE user_telegram
     SET notifications_enabled = $2
     WHERE user_id = $1 AND is_verified = true
     RETURNING id`,
    [userId, enabled]
  );
  return (result.rowCount ?? 0) > 0;
}

// 获取收藏地址的通知设置
export async function getFavoriteNotificationSettings(userId: number): Promise<Map<string, boolean>> {
  const result = await db.query<{ wallet_address: string; notifications_enabled: boolean }>(
    'SELECT wallet_address, notifications_enabled FROM favorite_notifications WHERE user_id = $1',
    [userId]
  );

  const settings = new Map<string, boolean>();
  for (const row of result.rows) {
    settings.set(row.wallet_address.toLowerCase(), row.notifications_enabled);
  }
  return settings;
}

// 切换单个地址的通知开关
export async function toggleAddressNotification(
  userId: number,
  walletAddress: string,
  enabled: boolean
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO favorite_notifications (user_id, wallet_address, notifications_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, wallet_address) DO UPDATE SET
       notifications_enabled = $3
     RETURNING id`,
    [userId, walletAddress.toLowerCase(), enabled]
  );
  return (result.rowCount ?? 0) > 0;
}

// 批量切换所有收藏地址的通知开关
export async function toggleAllAddressNotifications(
  userId: number,
  enabled: boolean
): Promise<number> {
  // 获取用户的所有收藏地址
  const favorites = await db.query<{ wallet_address: string }>(
    'SELECT wallet_address FROM user_favorites WHERE user_id = $1',
    [userId]
  );

  if (favorites.rows.length === 0) return 0;

  // 批量插入或更新
  const addresses = favorites.rows.map(r => r.wallet_address.toLowerCase());
  let updated = 0;

  for (const addr of addresses) {
    const result = await db.query(
      `INSERT INTO favorite_notifications (user_id, wallet_address, notifications_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, wallet_address) DO UPDATE SET
         notifications_enabled = $3`,
      [userId, addr, enabled]
    );
    if ((result.rowCount ?? 0) > 0) updated++;
  }

  return updated;
}

// 获取需要通知的用户列表（根据交易地址）
export async function getUsersToNotify(traderAddress: string): Promise<Array<{
  userId: number;
  chatId: string;
}>> {
  const result = await db.query<{ user_id: number; telegram_chat_id: string }>(
    `SELECT DISTINCT ut.user_id, ut.telegram_chat_id
     FROM user_telegram ut
     JOIN user_favorites uf ON ut.user_id = uf.user_id
     LEFT JOIN favorite_notifications fn ON ut.user_id = fn.user_id 
       AND LOWER(fn.wallet_address) = LOWER(uf.wallet_address)
     WHERE ut.is_verified = true
       AND ut.notifications_enabled = true
       AND LOWER(uf.wallet_address) = LOWER($1)
       AND COALESCE(fn.notifications_enabled, true) = true`,
    [traderAddress]
  );

  return result.rows.map(r => ({
    userId: r.user_id,
    chatId: r.telegram_chat_id,
  }));
}

// 发送交易通知
export async function sendTradeNotification(
  traderAddress: string,
  event: {
    symbol: string;
    action: string;
    sizeUsd: number;
    price: number;
    newSide: string;
    newPositionUsd: number;
    traderRank?: number;
  }
): Promise<number> {
  const usersToNotify = await getUsersToNotify(traderAddress);
  
  if (usersToNotify.length === 0) return 0;

  // 格式化消息
  const actionEmoji = event.action.includes('long') ? '🟢' : '🔴';
  const actionText = formatActionText(event.action);
  const shortAddress = `${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}`;
  
  const message = `
${actionEmoji} <b>Smart Money Alert</b>

📍 <b>Trader:</b> <code>${shortAddress}</code>${event.traderRank ? ` (Rank #${event.traderRank})` : ''}
💰 <b>Action:</b> ${actionText}
🪙 <b>Token:</b> ${event.symbol}
📊 <b>Size:</b> $${formatNumber(event.sizeUsd)}
💵 <b>Price:</b> $${event.price.toFixed(2)}
📈 <b>New Position:</b> ${event.newSide === 'flat' ? 'Closed' : `$${formatNumber(event.newPositionUsd)} ${event.newSide.toUpperCase()}`}

🔗 <a href="https://smart-perp.xyz/trader/${traderAddress}">View Trader</a>
`.trim();

  let sentCount = 0;
  for (const user of usersToNotify) {
    const sent = await sendTelegramMessage(user.chatId, message);
    if (sent) sentCount++;
  }

  return sentCount;
}

function formatActionText(action: string): string {
  const actionMap: Record<string, string> = {
    'open_long': '开多 Open Long',
    'add_long': '加多 Add Long',
    'reduce_long': '减多 Reduce Long',
    'close_long': '平多 Close Long',
    'open_short': '开空 Open Short',
    'add_short': '加空 Add Short',
    'reduce_short': '减空 Reduce Short',
    'close_short': '平空 Close Short',
    'flip_long_to_short': '多翻空 Flip to Short',
    'flip_short_to_long': '空翻多 Flip to Long',
  };
  return actionMap[action] || action;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
}

