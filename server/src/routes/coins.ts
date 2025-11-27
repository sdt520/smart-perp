import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

interface Coin {
  symbol: string;
  trade_count: number;
  last_seen_at: Date;
}

// GET /api/coins - Get all coins with trade activity
router.get('/', async (_req, res) => {
  try {
    const query = `
      SELECT symbol, trade_count, last_seen_at
      FROM coins
      ORDER BY trade_count DESC
    `;
    const result = await db.query<Coin>(query);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching coins:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/coins/:symbol/wallets - Get wallets that trade a specific coin
router.get('/:symbol/wallets', async (req, res) => {
  try {
    const { symbol } = req.params;
    const sortBy = (req.query.sortBy as string) || 'pnl_30d';
    const sortDir = (req.query.sortDir as string) || 'desc';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate sort field
    const validSortFields = ['pnl_7d', 'pnl_30d', 'win_rate_7d', 'win_rate_30d', 'trades_count_7d', 'trades_count_30d'];
    const safeSortField = validSortFields.includes(sortBy) ? sortBy : 'pnl_30d';
    const safeSortDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await db.query<{ total: string }>(
      'SELECT COUNT(*) as total FROM wallet_coin_metrics WHERE coin = $1',
      [symbol.toUpperCase()]
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Get wallets with their coin-specific metrics
    const query = `
      SELECT 
        w.id,
        w.address,
        w.platform_id,
        p.name AS platform_name,
        w.twitter_handle,
        w.label,
        cm.coin,
        cm.pnl_7d::float,
        cm.pnl_30d::float,
        cm.win_rate_7d::float,
        cm.win_rate_30d::float,
        cm.trades_count_7d,
        cm.trades_count_30d,
        cm.total_volume_30d::float,
        cm.last_trade_at,
        cm.calculated_at
      FROM wallet_coin_metrics cm
      JOIN wallets w ON cm.wallet_id = w.id
      JOIN platforms p ON w.platform_id = p.id
      WHERE cm.coin = $1 AND w.is_active = true
      ORDER BY cm.${safeSortField} ${safeSortDir} NULLS LAST
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [symbol.toUpperCase(), limit, offset]);

    res.json({
      success: true,
      data: result.rows,
      coin: symbol.toUpperCase(),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching coin wallets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/coins/:symbol/stats - Get stats for a specific coin
router.get('/:symbol/stats', async (req, res) => {
  try {
    const { symbol } = req.params;

    const query = `
      SELECT 
        COUNT(DISTINCT wallet_id)::int AS total_traders,
        COALESCE(SUM(pnl_30d), 0)::float AS total_pnl_30d,
        COALESCE(AVG(win_rate_30d), 0)::float AS avg_win_rate,
        COALESCE(SUM(trades_count_30d), 0)::int AS total_trades,
        COALESCE(SUM(total_volume_30d), 0)::float AS total_volume
      FROM wallet_coin_metrics
      WHERE coin = $1
    `;

    const result = await db.query(query, [symbol.toUpperCase()]);
    const stats = result.rows[0];

    // Get top performer for this coin
    const topQuery = `
      SELECT 
        w.address,
        w.label,
        w.twitter_handle,
        cm.pnl_30d::float
      FROM wallet_coin_metrics cm
      JOIN wallets w ON cm.wallet_id = w.id
      WHERE cm.coin = $1
      ORDER BY cm.pnl_30d DESC
      LIMIT 1
    `;
    const topResult = await db.query(topQuery, [symbol.toUpperCase()]);
    const topPerformer = topResult.rows[0] || null;

    res.json({
      success: true,
      data: {
        coin: symbol.toUpperCase(),
        totalTraders: stats?.total_traders || 0,
        totalPnl30d: stats?.total_pnl_30d || 0,
        avgWinRate: stats?.avg_win_rate || 0,
        totalTrades: stats?.total_trades || 0,
        totalVolume: stats?.total_volume || 0,
        topPerformer,
      },
    });
  } catch (error) {
    console.error('Error fetching coin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;

