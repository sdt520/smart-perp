import db from '../db/index.js';
import { sendTelegramMessage } from './telegramService.js';

// Types
export interface BlockchainNetwork {
  id: string;
  name: string;
  chain_id: number | null;
  explorer_url: string | null;
  is_enabled: boolean;
}

export interface DumpRadarToken {
  id: number;
  symbol: string;
  name: string | null;
  contract_address: string;
  network_id: string;
  decimals: number;
  logo_url: string | null;
  coingecko_id: string | null;
  market_cap: number | null;
  price_usd: number | null;
  price_updated_at: Date | null;
  is_popular: boolean;
  is_enabled: boolean;
}

export interface DumpRadarEvent {
  id: number;
  token_id: number;
  network_id: string;
  tx_hash: string;
  block_number: number | null;
  from_address: string;
  to_address: string;
  to_binance_label: string | null;
  amount: string;
  amount_formatted: number | null;
  amount_usd: number | null;
  price_at_time: number | null;
  from_label: string | null;
  from_tag: string | null;
  tx_timestamp: Date;
  // Join fields
  token_symbol?: string;
  token_name?: string;
  network_name?: string;
  explorer_url?: string;
}

export interface UserWatchlistItem {
  id: number;
  user_id: number;
  token_id: number;
  threshold_usd: number;
  notifications_enabled: boolean;
  // Join fields
  token_symbol?: string;
  token_name?: string;
  network_id?: string;
  network_name?: string;
  contract_address?: string;
  price_usd?: number;
  logo_url?: string;
}

export interface TokenStats {
  token_id: number;
  inflow_24h_count: number;
  inflow_24h_usd: number;
  outflow_24h_usd: number;
  net_inflow_24h_usd: number;
  inflow_7d_usd: number;
}

// 获取所有支持的网络
export async function getNetworks(): Promise<BlockchainNetwork[]> {
  const result = await db.query<BlockchainNetwork>(
    'SELECT * FROM blockchain_networks WHERE is_enabled = true ORDER BY name'
  );
  return result.rows;
}

// 获取热门代币（预置的）
export async function getPopularTokens(): Promise<DumpRadarToken[]> {
  const result = await db.query<DumpRadarToken>(
    `SELECT * FROM dump_radar_tokens 
     WHERE is_popular = true AND is_enabled = true 
     ORDER BY symbol`
  );
  return result.rows;
}

// 搜索代币
export async function searchTokens(query: string, networkId?: string): Promise<DumpRadarToken[]> {
  let sql = `
    SELECT * FROM dump_radar_tokens 
    WHERE is_enabled = true 
      AND (LOWER(symbol) LIKE $1 OR LOWER(name) LIKE $1 OR LOWER(contract_address) LIKE $1)
  `;
  const params: (string | undefined)[] = [`%${query.toLowerCase()}%`];
  
  if (networkId) {
    sql += ' AND network_id = $2';
    params.push(networkId);
  }
  
  sql += ' ORDER BY is_popular DESC, symbol LIMIT 50';
  
  const result = await db.query<DumpRadarToken>(sql, params);
  return result.rows;
}

// 获取单个代币
export async function getToken(tokenId: number): Promise<DumpRadarToken | null> {
  const result = await db.query<DumpRadarToken>(
    'SELECT * FROM dump_radar_tokens WHERE id = $1',
    [tokenId]
  );
  return result.rows[0] || null;
}

// 根据合约地址获取代币
export async function getTokenByContract(networkId: string, contractAddress: string): Promise<DumpRadarToken | null> {
  const result = await db.query<DumpRadarToken>(
    'SELECT * FROM dump_radar_tokens WHERE network_id = $1 AND LOWER(contract_address) = LOWER($2)',
    [networkId, contractAddress]
  );
  return result.rows[0] || null;
}

// 添加新代币（如果不存在）
export async function addToken(
  symbol: string,
  name: string | null,
  contractAddress: string,
  networkId: string,
  decimals: number = 18,
  coingeckoId?: string
): Promise<DumpRadarToken> {
  const result = await db.query<DumpRadarToken>(
    `INSERT INTO dump_radar_tokens (symbol, name, contract_address, network_id, decimals, coingecko_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (network_id, contract_address) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       name = EXCLUDED.name,
       decimals = EXCLUDED.decimals,
       coingecko_id = COALESCE(EXCLUDED.coingecko_id, dump_radar_tokens.coingecko_id)
     RETURNING *`,
    [symbol.toUpperCase(), name, contractAddress.toLowerCase(), networkId, decimals, coingeckoId]
  );
  return result.rows[0];
}

// 获取用户监控列表
export async function getUserWatchlist(userId: number): Promise<UserWatchlistItem[]> {
  const result = await db.query<UserWatchlistItem>(
    `SELECT w.*, 
            t.symbol as token_symbol, 
            t.name as token_name,
            t.network_id,
            t.contract_address,
            t.price_usd,
            t.logo_url,
            n.name as network_name
     FROM user_dump_radar_watchlist w
     JOIN dump_radar_tokens t ON w.token_id = t.id
     JOIN blockchain_networks n ON t.network_id = n.id
     WHERE w.user_id = $1
     ORDER BY t.symbol`,
    [userId]
  );
  return result.rows;
}

// 添加代币到用户监控列表
export async function addToWatchlist(
  userId: number,
  tokenId: number,
  thresholdUsd: number = 1000000
): Promise<UserWatchlistItem> {
  const result = await db.query<UserWatchlistItem>(
    `INSERT INTO user_dump_radar_watchlist (user_id, token_id, threshold_usd)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token_id) DO UPDATE SET
       threshold_usd = EXCLUDED.threshold_usd
     RETURNING *`,
    [userId, tokenId, thresholdUsd]
  );
  return result.rows[0];
}

// 从监控列表移除
export async function removeFromWatchlist(userId: number, tokenId: number): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM user_dump_radar_watchlist WHERE user_id = $1 AND token_id = $2',
    [userId, tokenId]
  );
  return (result.rowCount ?? 0) > 0;
}

// 更新监控阈值
export async function updateWatchlistThreshold(
  userId: number,
  tokenId: number,
  thresholdUsd: number
): Promise<boolean> {
  const result = await db.query(
    `UPDATE user_dump_radar_watchlist 
     SET threshold_usd = $3 
     WHERE user_id = $1 AND token_id = $2`,
    [userId, tokenId, thresholdUsd]
  );
  return (result.rowCount ?? 0) > 0;
}

// 切换监控通知
export async function toggleWatchlistNotification(
  userId: number,
  tokenId: number,
  enabled: boolean
): Promise<boolean> {
  const result = await db.query(
    `UPDATE user_dump_radar_watchlist 
     SET notifications_enabled = $3 
     WHERE user_id = $1 AND token_id = $2`,
    [userId, tokenId, enabled]
  );
  return (result.rowCount ?? 0) > 0;
}

// 获取大额充值事件（实时 Feed）
export async function getEvents(options: {
  tokenId?: number;
  networkId?: string;
  minAmountUsd?: number;
  limit?: number;
  offset?: number;
  startTime?: Date;
}): Promise<{ events: DumpRadarEvent[]; total: number }> {
  const { tokenId, networkId, minAmountUsd = 1000000, limit = 50, offset = 0, startTime } = options;
  
  let whereClauses = ['e.amount_usd >= $1'];
  const params: (number | string | Date)[] = [minAmountUsd];
  let paramIndex = 2;
  
  if (tokenId) {
    whereClauses.push(`e.token_id = $${paramIndex++}`);
    params.push(tokenId);
  }
  
  if (networkId) {
    whereClauses.push(`e.network_id = $${paramIndex++}`);
    params.push(networkId);
  }
  
  if (startTime) {
    whereClauses.push(`e.tx_timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }
  
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  
  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM dump_radar_events e ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);
  
  // Get events
  const result = await db.query<DumpRadarEvent>(
    `SELECT e.*, 
            t.symbol as token_symbol,
            t.name as token_name,
            n.name as network_name,
            n.explorer_url
     FROM dump_radar_events e
     JOIN dump_radar_tokens t ON e.token_id = t.id
     JOIN blockchain_networks n ON e.network_id = n.id
     ${whereClause}
     ORDER BY e.tx_timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );
  
  return { events: result.rows, total };
}

// 获取代币统计
export async function getTokenStats(tokenId: number): Promise<TokenStats | null> {
  const result = await db.query<{
    inflow_24h_count: string;
    inflow_24h_usd: string;
    inflow_7d_usd: string;
  }>(
    `SELECT 
       COUNT(CASE WHEN tx_timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as inflow_24h_count,
       COALESCE(SUM(CASE WHEN tx_timestamp >= NOW() - INTERVAL '24 hours' THEN amount_usd END), 0) as inflow_24h_usd,
       COALESCE(SUM(CASE WHEN tx_timestamp >= NOW() - INTERVAL '7 days' THEN amount_usd END), 0) as inflow_7d_usd
     FROM dump_radar_events
     WHERE token_id = $1`,
    [tokenId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    token_id: tokenId,
    inflow_24h_count: parseInt(row.inflow_24h_count, 10),
    inflow_24h_usd: parseFloat(row.inflow_24h_usd),
    outflow_24h_usd: 0, // TODO: implement outflow tracking
    net_inflow_24h_usd: parseFloat(row.inflow_24h_usd),
    inflow_7d_usd: parseFloat(row.inflow_7d_usd),
  };
}

// 获取所有代币的统计汇总
export async function getAllTokenStats(options: {
  period?: '24h' | '7d';
  limit?: number;
}): Promise<Array<TokenStats & { token_symbol: string; token_name: string; network_id: string }>> {
  const { period = '24h', limit = 20 } = options;
  const interval = period === '24h' ? '24 hours' : '7 days';
  
  const result = await db.query<{
    token_id: number;
    token_symbol: string;
    token_name: string;
    network_id: string;
    inflow_count: string;
    inflow_usd: string;
  }>(
    `SELECT 
       e.token_id,
       t.symbol as token_symbol,
       t.name as token_name,
       t.network_id,
       COUNT(*) as inflow_count,
       COALESCE(SUM(e.amount_usd), 0) as inflow_usd
     FROM dump_radar_events e
     JOIN dump_radar_tokens t ON e.token_id = t.id
     WHERE e.tx_timestamp >= NOW() - INTERVAL '${interval}'
     GROUP BY e.token_id, t.symbol, t.name, t.network_id
     ORDER BY inflow_usd DESC
     LIMIT $1`,
    [limit]
  );
  
  return result.rows.map(row => ({
    token_id: row.token_id,
    token_symbol: row.token_symbol,
    token_name: row.token_name || '',
    network_id: row.network_id,
    inflow_24h_count: parseInt(row.inflow_count, 10),
    inflow_24h_usd: parseFloat(row.inflow_usd),
    outflow_24h_usd: 0,
    net_inflow_24h_usd: parseFloat(row.inflow_usd),
    inflow_7d_usd: period === '7d' ? parseFloat(row.inflow_usd) : 0,
  }));
}

// 检查地址是否是 Binance 地址
export async function isBinanceAddress(networkId: string, address: string): Promise<{
  isBinance: boolean;
  label?: string;
  addressType?: string;
}> {
  const result = await db.query<{ label: string; address_type: string }>(
    `SELECT label, address_type FROM binance_addresses 
     WHERE network_id = $1 AND LOWER(address) = LOWER($2)`,
    [networkId, address]
  );
  
  if (result.rows.length > 0) {
    return {
      isBinance: true,
      label: result.rows[0].label,
      addressType: result.rows[0].address_type,
    };
  }
  
  return { isBinance: false };
}

// 添加 Binance 地址
export async function addBinanceAddress(
  address: string,
  networkId: string,
  label: string | null,
  addressType: string,
  source: string = 'manual'
): Promise<void> {
  await db.query(
    `INSERT INTO binance_addresses (address, network_id, label, address_type, source, first_seen_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (network_id, address) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, binance_addresses.label),
       last_seen_at = NOW()`,
    [address.toLowerCase(), networkId, label, addressType, source]
  );
}

// 记录充值事件
export async function recordEvent(event: {
  tokenId: number;
  networkId: string;
  txHash: string;
  blockNumber?: number;
  fromAddress: string;
  toAddress: string;
  toBinanceLabel?: string;
  amount: string;
  amountFormatted: number;
  amountUsd: number;
  priceAtTime: number;
  fromLabel?: string;
  fromTag?: string;
  txTimestamp: Date;
}): Promise<DumpRadarEvent> {
  const result = await db.query<DumpRadarEvent>(
    `INSERT INTO dump_radar_events (
       token_id, network_id, tx_hash, block_number,
       from_address, to_address, to_binance_label,
       amount, amount_formatted, amount_usd, price_at_time,
       from_label, from_tag, tx_timestamp
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (network_id, tx_hash) DO NOTHING
     RETURNING *`,
    [
      event.tokenId,
      event.networkId,
      event.txHash,
      event.blockNumber,
      event.fromAddress.toLowerCase(),
      event.toAddress.toLowerCase(),
      event.toBinanceLabel,
      event.amount,
      event.amountFormatted,
      event.amountUsd,
      event.priceAtTime,
      event.fromLabel,
      event.fromTag,
      event.txTimestamp,
    ]
  );
  return result.rows[0];
}

// 获取需要通知的用户
export async function getUsersToNotifyForEvent(
  tokenId: number,
  amountUsd: number
): Promise<Array<{ userId: number; chatId: string }>> {
  const result = await db.query<{ user_id: number; telegram_chat_id: string }>(
    `SELECT DISTINCT ut.user_id, ut.telegram_chat_id
     FROM user_telegram ut
     JOIN user_dump_radar_watchlist w ON ut.user_id = w.user_id
     LEFT JOIN user_dump_radar_settings s ON ut.user_id = s.user_id
     WHERE ut.is_verified = true
       AND ut.notifications_enabled = true
       AND w.token_id = $1
       AND w.notifications_enabled = true
       AND w.threshold_usd <= $2
       AND COALESCE(s.notifications_enabled, true) = true`,
    [tokenId, amountUsd]
  );
  
  return result.rows.map(r => ({
    userId: r.user_id,
    chatId: r.telegram_chat_id,
  }));
}

// 发送 Dump Radar 通知
export async function sendDumpRadarNotification(
  event: DumpRadarEvent,
  token: DumpRadarToken,
  networkName: string,
  explorerUrl: string
): Promise<number> {
  const usersToNotify = await getUsersToNotifyForEvent(event.token_id, event.amount_usd || 0);
  
  if (usersToNotify.length === 0) return 0;
  
  const shortFromAddress = `${event.from_address.slice(0, 6)}...${event.from_address.slice(-4)}`;
  const txLink = `${explorerUrl}/tx/${event.tx_hash}`;
  const amountFormatted = formatNumber(event.amount_formatted || 0);
  const amountUsdFormatted = formatNumber(event.amount_usd || 0);
  
  const fromTagEmoji = event.from_tag === 'project_team' ? '🏢' 
    : event.from_tag === 'fund' ? '🏦'
    : event.from_tag === 'whale' ? '🐋'
    : '❓';
  
  const message = `
🔔 <b>[Binance Inflow Alert]</b>

🪙 <b>Token:</b> $${token.symbol} (${networkName})
💰 <b>Amount:</b> ${amountFormatted} (~$${amountUsdFormatted})
📤 <b>From:</b> <code>${shortFromAddress}</code> ${event.from_label ? `(${event.from_label})` : ''} ${fromTagEmoji}
📥 <b>To:</b> ${event.to_binance_label || 'Binance'}
🔗 <a href="${txLink}">View Transaction</a>
`.trim();

  let sentCount = 0;
  for (const user of usersToNotify) {
    const sent = await sendTelegramMessage(user.chatId, message);
    if (sent) sentCount++;
  }
  
  return sentCount;
}

// 获取/设置用户 Dump Radar 设置
export async function getUserSettings(userId: number): Promise<{
  notificationsEnabled: boolean;
  defaultThresholdUsd: number;
} | null> {
  const result = await db.query<{
    notifications_enabled: boolean;
    default_threshold_usd: string;
  }>(
    'SELECT * FROM user_dump_radar_settings WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) return null;
  
  return {
    notificationsEnabled: result.rows[0].notifications_enabled,
    defaultThresholdUsd: parseFloat(result.rows[0].default_threshold_usd),
  };
}

export async function updateUserSettings(
  userId: number,
  settings: { notificationsEnabled?: boolean; defaultThresholdUsd?: number }
): Promise<void> {
  await db.query(
    `INSERT INTO user_dump_radar_settings (user_id, notifications_enabled, default_threshold_usd)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       notifications_enabled = COALESCE($2, user_dump_radar_settings.notifications_enabled),
       default_threshold_usd = COALESCE($3, user_dump_radar_settings.default_threshold_usd)`,
    [userId, settings.notificationsEnabled ?? true, settings.defaultThresholdUsd ?? 1000000]
  );
}

// 获取用户 Dump Radar 通知设置（按代币符号）
export async function getUserNotificationTokens(userId: number): Promise<{
  notificationsEnabled: boolean;
  watchAllTokens: boolean;
  tokens: string[];  // 代币符号列表
  thresholdUsd: number;
}> {
  // 获取用户设置
  const settingsResult = await db.query<{
    notifications_enabled: boolean;
    watch_all_tokens: boolean;
    default_threshold_usd: string;
  }>(
    'SELECT notifications_enabled, watch_all_tokens, default_threshold_usd FROM user_dump_radar_settings WHERE user_id = $1',
    [userId]
  );
  
  // 获取用户选择的代币符号
  const tokensResult = await db.query<{ token_symbol: string }>(
    'SELECT token_symbol FROM user_dump_radar_notification_tokens WHERE user_id = $1',
    [userId]
  );
  
  const settings = settingsResult.rows[0];
  return {
    notificationsEnabled: settings?.notifications_enabled ?? false,
    watchAllTokens: settings?.watch_all_tokens ?? true,
    tokens: tokensResult.rows.map(r => r.token_symbol),
    thresholdUsd: parseFloat(settings?.default_threshold_usd || '1000000'),
  };
}

// 更新用户 Dump Radar 通知设置
export async function updateUserNotificationSettings(
  userId: number,
  settings: {
    notificationsEnabled?: boolean;
    watchAllTokens?: boolean;
    tokens?: string[];  // 代币符号列表
    thresholdUsd?: number;
  }
): Promise<void> {
  // 更新主设置
  await db.query(
    `INSERT INTO user_dump_radar_settings (user_id, notifications_enabled, watch_all_tokens, default_threshold_usd)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       notifications_enabled = COALESCE($2, user_dump_radar_settings.notifications_enabled),
       watch_all_tokens = COALESCE($3, user_dump_radar_settings.watch_all_tokens),
       default_threshold_usd = COALESCE($4, user_dump_radar_settings.default_threshold_usd)`,
    [
      userId,
      settings.notificationsEnabled ?? true,
      settings.watchAllTokens ?? true,
      settings.thresholdUsd ?? 1000000,
    ]
  );
  
  // 如果提供了代币列表，更新
  if (settings.tokens !== undefined) {
    // 删除旧的
    await db.query('DELETE FROM user_dump_radar_notification_tokens WHERE user_id = $1', [userId]);
    
    // 插入新的
    if (settings.tokens.length > 0) {
      const values = settings.tokens.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO user_dump_radar_notification_tokens (user_id, token_symbol) VALUES ${values}`,
        [userId, ...settings.tokens]
      );
    }
  }
}

// 获取需要通知的用户（按代币符号）
export async function getUsersToNotifyForSymbol(
  tokenSymbol: string,
  amountUsd: number
): Promise<Array<{ userId: number; chatId: string }>> {
  const result = await db.query<{ user_id: number; telegram_chat_id: string }>(
    `SELECT DISTINCT ut.user_id, ut.telegram_chat_id
     FROM user_telegram ut
     JOIN user_dump_radar_settings s ON ut.user_id = s.user_id
     LEFT JOIN user_dump_radar_notification_tokens t ON ut.user_id = t.user_id
     WHERE ut.is_verified = true
       AND ut.notifications_enabled = true
       AND s.notifications_enabled = true
       AND s.default_threshold_usd <= $2
       AND (s.watch_all_tokens = true OR t.token_symbol = $1)`,
    [tokenSymbol, amountUsd]
  );
  
  return result.rows.map(r => ({
    userId: r.user_id,
    chatId: r.telegram_chat_id,
  }));
}

// Helper function
function formatNumber(num: number): string {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(2);
}

