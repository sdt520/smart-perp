import { Router, Request, Response, NextFunction } from 'express';
import * as dumpRadarService from '../services/dumpRadarService.js';
import * as authService from '../services/authService.js';
import * as binanceSpotService from '../services/binanceSpotService.js';

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

// Optional auth middleware - doesn't require auth but extracts user if present
async function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = authService.verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

// ============ Public Endpoints ============

// GET /api/dump-radar/networks - 获取支持的网络
router.get('/networks', async (_req, res) => {
  try {
    const networks = await dumpRadarService.getNetworks();
    res.json({ success: true, data: networks });
  } catch (error) {
    console.error('Get networks error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/binance-tokens - 获取币安现货代币列表
router.get('/binance-tokens', async (_req, res) => {
  try {
    const tokens = await binanceSpotService.getBinanceSpotTokens();
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Get Binance tokens error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/binance-tokens/search - 搜索币安代币
router.get('/binance-tokens/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ success: false, error: 'Query parameter q is required' });
      return;
    }
    const tokens = await binanceSpotService.searchBinanceSpotTokens(q);
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Search Binance tokens error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/binance-tokens/top - 获取热门代币（大市值）
router.get('/binance-tokens/top', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const tokens = await binanceSpotService.getTopSpotTokens(limit);
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Get top Binance tokens error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/tokens/popular - 获取热门代币
router.get('/tokens/popular', async (_req, res) => {
  try {
    const tokens = await dumpRadarService.getPopularTokens();
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Get popular tokens error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/tokens/search - 搜索代币
router.get('/tokens/search', async (req, res) => {
  try {
    const { q, network } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ success: false, error: 'Query parameter q is required' });
      return;
    }
    
    const tokens = await dumpRadarService.searchTokens(q, network as string | undefined);
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Search tokens error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/tokens/:id - 获取单个代币
router.get('/tokens/:id', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      res.status(400).json({ success: false, error: 'Invalid token ID' });
      return;
    }
    
    const token = await dumpRadarService.getToken(tokenId);
    if (!token) {
      res.status(404).json({ success: false, error: 'Token not found' });
      return;
    }
    
    res.json({ success: true, data: token });
  } catch (error) {
    console.error('Get token error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/events - 获取大额充值事件（实时 Feed）
router.get('/events', async (req, res) => {
  try {
    const { token_id, network, min_amount, limit, offset, start_time } = req.query;
    
    const options: Parameters<typeof dumpRadarService.getEvents>[0] = {
      tokenId: token_id ? parseInt(token_id as string, 10) : undefined,
      networkId: network as string | undefined,
      minAmountUsd: min_amount ? parseFloat(min_amount as string) : 1000000,
      limit: limit ? Math.min(parseInt(limit as string, 10), 100) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      startTime: start_time ? new Date(start_time as string) : undefined,
    };
    
    const { events, total } = await dumpRadarService.getEvents(options);
    res.json({ success: true, data: { events, total } });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/stats - 获取所有代币统计
router.get('/stats', async (req, res) => {
  try {
    const { period, limit } = req.query;
    
    const stats = await dumpRadarService.getAllTokenStats({
      period: (period as '24h' | '7d') || '24h',
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/tokens/:id/stats - 获取单个代币统计
router.get('/tokens/:id/stats', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      res.status(400).json({ success: false, error: 'Invalid token ID' });
      return;
    }
    
    const stats = await dumpRadarService.getTokenStats(tokenId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get token stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============ Authenticated Endpoints ============

// GET /api/dump-radar/watchlist - 获取用户监控列表
router.get('/watchlist', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const watchlist = await dumpRadarService.getUserWatchlist(userId);
    res.json({ success: true, data: watchlist });
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/dump-radar/watchlist - 添加代币到监控列表
router.post('/watchlist', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { token_id, threshold_usd } = req.body;
    
    if (!token_id || typeof token_id !== 'number') {
      res.status(400).json({ success: false, error: 'token_id is required' });
      return;
    }
    
    // 验证代币存在
    const token = await dumpRadarService.getToken(token_id);
    if (!token) {
      res.status(404).json({ success: false, error: 'Token not found' });
      return;
    }
    
    const item = await dumpRadarService.addToWatchlist(
      userId,
      token_id,
      threshold_usd ?? 1000000
    );
    
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/dump-radar/watchlist/by-contract - 通过合约地址添加代币
router.post('/watchlist/by-contract', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { network_id, contract_address, symbol, name, decimals, threshold_usd } = req.body;
    
    if (!network_id || !contract_address) {
      res.status(400).json({ success: false, error: 'network_id and contract_address are required' });
      return;
    }
    
    // 先检查代币是否存在，如果不存在则添加
    let token = await dumpRadarService.getTokenByContract(network_id, contract_address);
    
    if (!token) {
      if (!symbol) {
        res.status(400).json({ success: false, error: 'symbol is required for new tokens' });
        return;
      }
      token = await dumpRadarService.addToken(
        symbol,
        name || null,
        contract_address,
        network_id,
        decimals || 18
      );
    }
    
    const item = await dumpRadarService.addToWatchlist(
      userId,
      token.id,
      threshold_usd ?? 1000000
    );
    
    res.json({ success: true, data: { ...item, token } });
  } catch (error) {
    console.error('Add to watchlist by contract error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/dump-radar/watchlist/:tokenId - 从监控列表移除
router.delete('/watchlist/:tokenId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tokenId = parseInt(req.params.tokenId, 10);
    
    if (isNaN(tokenId)) {
      res.status(400).json({ success: false, error: 'Invalid token ID' });
      return;
    }
    
    await dumpRadarService.removeFromWatchlist(userId, tokenId);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/dump-radar/watchlist/:tokenId/threshold - 更新阈值
router.patch('/watchlist/:tokenId/threshold', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tokenId = parseInt(req.params.tokenId, 10);
    const { threshold_usd } = req.body;
    
    if (isNaN(tokenId)) {
      res.status(400).json({ success: false, error: 'Invalid token ID' });
      return;
    }
    
    if (typeof threshold_usd !== 'number' || threshold_usd < 0) {
      res.status(400).json({ success: false, error: 'threshold_usd must be a non-negative number' });
      return;
    }
    
    await dumpRadarService.updateWatchlistThreshold(userId, tokenId, threshold_usd);
    res.json({ success: true, data: { threshold_usd } });
  } catch (error) {
    console.error('Update threshold error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/dump-radar/watchlist/:tokenId/notification - 切换通知
router.patch('/watchlist/:tokenId/notification', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tokenId = parseInt(req.params.tokenId, 10);
    const { enabled } = req.body;
    
    if (isNaN(tokenId)) {
      res.status(400).json({ success: false, error: 'Invalid token ID' });
      return;
    }
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      return;
    }
    
    await dumpRadarService.toggleWatchlistNotification(userId, tokenId, enabled);
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error('Toggle notification error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/settings - 获取用户设置
router.get('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const settings = await dumpRadarService.getUserSettings(userId);
    
    res.json({
      success: true,
      data: settings || {
        notificationsEnabled: true,
        defaultThresholdUsd: 1000000,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/dump-radar/settings - 更新用户设置
router.patch('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { notifications_enabled, default_threshold_usd } = req.body;
    
    await dumpRadarService.updateUserSettings(userId, {
      notificationsEnabled: notifications_enabled,
      defaultThresholdUsd: default_threshold_usd,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/dump-radar/notification-settings - 获取用户通知设置（按代币符号）
router.get('/notification-settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const settings = await dumpRadarService.getUserNotificationTokens(userId);
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/dump-radar/notification-settings - 更新用户通知设置
router.put('/notification-settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { notifications_enabled, watch_all_tokens, tokens, threshold_usd } = req.body;
    
    await dumpRadarService.updateUserNotificationSettings(userId, {
      notificationsEnabled: notifications_enabled,
      watchAllTokens: watch_all_tokens,
      tokens: tokens,
      thresholdUsd: threshold_usd,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/dump-radar/check-binance - 检查地址是否是 Binance（用于测试）
router.post('/check-binance', optionalAuthMiddleware, async (req, res) => {
  try {
    const { network_id, address } = req.body;
    
    if (!network_id || !address) {
      res.status(400).json({ success: false, error: 'network_id and address are required' });
      return;
    }
    
    const result = await dumpRadarService.isBinanceAddress(network_id, address);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Check Binance address error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

