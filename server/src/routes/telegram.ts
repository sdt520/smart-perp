import { Router, Request, Response, NextFunction } from 'express';
import * as telegramService from '../services/telegramService.js';
import * as authService from '../services/authService.js';

const router = Router();

// Auth middleware
interface AuthRequest extends Request {
  user?: authService.UserPayload;
}

async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = authService.verifyToken(token);
  
  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  req.user = payload;
  next();
}

// GET /api/telegram/status - 获取 Telegram 绑定状态
router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const telegram = await telegramService.getUserTelegram(userId);
    
    if (!telegram) {
      res.json({
        success: true,
        data: {
          bound: false,
          verified: false,
          notificationsEnabled: false,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        bound: true,
        verified: telegram.is_verified,
        username: telegram.telegram_username,
        notificationsEnabled: telegram.notifications_enabled,
      },
    });
  } catch (error) {
    console.error('Get telegram status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/telegram/bind - 开始绑定流程，获取验证码
router.post('/bind', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { code, expiresAt } = await telegramService.initTelegramBinding(userId);
    
    res.json({
      success: true,
      data: {
        code,
        expiresAt: expiresAt.toISOString(),
        botUsername: process.env.TELEGRAM_BOT_USERNAME || 'SmartPerpBot',
      },
    });
  } catch (error) {
    console.error('Bind telegram error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/telegram/unbind - 解绑 Telegram
router.delete('/unbind', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    await telegramService.unbindTelegram(userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Unbind telegram error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/telegram/toggle-global - 切换全局通知开关
router.post('/toggle-global', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      return;
    }

    const success = await telegramService.toggleGlobalNotifications(userId, enabled);
    
    if (!success) {
      res.status(400).json({ success: false, error: 'Telegram not bound or not verified' });
      return;
    }

    res.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error('Toggle global notifications error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/telegram/notification-settings - 获取所有收藏地址的通知设置
router.get('/notification-settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const settings = await telegramService.getFavoriteNotificationSettings(userId);
    
    // 转换 Map 为对象
    const settingsObj: Record<string, boolean> = {};
    settings.forEach((value, key) => {
      settingsObj[key] = value;
    });

    res.json({
      success: true,
      data: settingsObj,
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/telegram/toggle-address/:address - 切换单个地址通知
router.post('/toggle-address/:address', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { address } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      return;
    }

    await telegramService.toggleAddressNotification(userId, address, enabled);
    
    res.json({ success: true, data: { address, enabled } });
  } catch (error) {
    console.error('Toggle address notification error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/telegram/toggle-all - 切换所有收藏地址的通知
router.post('/toggle-all', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      return;
    }

    const count = await telegramService.toggleAllAddressNotifications(userId, enabled);
    
    res.json({ success: true, data: { enabled, count } });
  } catch (error) {
    console.error('Toggle all notifications error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/telegram/webhook - Telegram Bot Webhook（公开端点）
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    
    // 处理消息
    if (update.message?.text) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const username = message.from?.username || null;
      const text = message.text.trim();

      // 检查是否是验证码（6位字母数字）
      if (/^[A-Z0-9]{6}$/.test(text)) {
        const result = await telegramService.verifyTelegramBinding(text, chatId, username);
        
        if (result.success) {
          await telegramService.sendTelegramMessage(
            chatId,
            '✅ <b>绑定成功！</b>\n\n您的 Telegram 已成功绑定到 Smart Perp Radar。\n\n当您收藏的钱包有交易时，您将收到通知。\n\n🔗 <a href="https://smart-perp.xyz/favorites">管理收藏</a>'
          );
        } else {
          await telegramService.sendTelegramMessage(
            chatId,
            '❌ <b>验证码无效或已过期</b>\n\n请返回 Smart Perp Radar 重新获取验证码。\n\n🔗 <a href="https://smart-perp.xyz/favorites">重新绑定</a>'
          );
        }
      } else if (text === '/start') {
        await telegramService.sendTelegramMessage(
          chatId,
          '👋 <b>欢迎使用 Smart Perp Radar Bot！</b>\n\n请在 Smart Perp Radar 网站的「我的收藏」页面点击「绑定 Telegram」获取验证码，然后将验证码发送给我。\n\n🔗 <a href="https://smart-perp.xyz/favorites">前往绑定</a>'
        );
      } else if (text === '/help') {
        await telegramService.sendTelegramMessage(
          chatId,
          '📖 <b>使用帮助</b>\n\n1. 访问 Smart Perp Radar 网站\n2. 登录账户\n3. 在「我的收藏」页面点击「绑定 Telegram」\n4. 将获取的验证码发送给我\n5. 绑定成功后，收藏地址的交易将会推送给您\n\n🔗 <a href="https://smart-perp.xyz">访问网站</a>'
        );
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.json({ ok: true }); // Telegram expects 200 even on errors
  }
});

export default router;

