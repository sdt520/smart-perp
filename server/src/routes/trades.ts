import { Router } from 'express';
import { z } from 'zod';
import db from '../db/index.js';

const router = Router();

// Schema for flow query params
const flowQuerySchema = z.object({
  coin: z.string().min(1),
  startTime: z.coerce.number().optional(),
  topN: z.coerce.number().min(1).max(500).default(100),
  minSize: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(500).default(100),
});

// Schema for overview query params
const overviewQuerySchema = z.object({
  coin: z.string().min(1),
  topN: z.coerce.number().min(1).max(500).default(100),
});

// Get trade flow for a specific coin (using token_flow_events table)
router.get('/flow', async (req, res) => {
  try {
    const { coin, startTime, topN, minSize, limit } = flowQuerySchema.parse(req.query);
    
    // Default to last 24 hours if no startTime
    const effectiveStartTime = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // First try to get from token_flow_events table (new architecture)
    const flowEventsQuery = `
      SELECT 
        e.id,
        e.ts,
        e.symbol,
        e.address,
        e.action,
        e.size_change_usd,
        e.old_notional_usd,
        e.new_notional_usd,
        e.new_side,
        e.fill_price,
        e.entry_price,
        e.leverage,
        e.trader_rank,
        e.pnl_30d,
        e.win_rate_30d,
        w.label
      FROM token_flow_events e
      LEFT JOIN wallets w ON e.wallet_id = w.id
      WHERE e.symbol = $1
        AND e.ts >= $2
        AND e.size_change_usd >= $3
        AND e.trader_rank <= $4
      ORDER BY e.ts DESC
      LIMIT $5
    `;
    
    let result = await db.query(flowEventsQuery, [coin, effectiveStartTime, minSize, topN, limit]);
    
    // If we have data from token_flow_events, use it
    if (result.rows.length > 0) {
      const events = result.rows.map(row => {
        const sizeChange = parseFloat(row.size_change_usd) || 0;
        const oldNotional = parseFloat(row.old_notional_usd) || 0;
        const newNotional = parseFloat(row.new_notional_usd) || 0;
        
        return {
          id: row.id.toString(),
          timestamp: new Date(row.ts).getTime(),
          address: row.address,
          label: row.label || undefined,
          rank: row.trader_rank,
          pnl30d: parseFloat(row.pnl_30d) || 0,
          winRate30d: parseFloat(row.win_rate_30d) || 0,
          action: row.action,
          coin: row.symbol,
          size: sizeChange,
          price: parseFloat(row.fill_price) || 0,
          leverage: parseFloat(row.leverage) || 1,
          positionBefore: oldNotional,
          positionAfter: newNotional,
        };
      });
      
      return res.json({
        success: true,
        data: events,
        source: 'position_engine',
      });
    }
    
    // Fallback to trades table (old architecture)
    const tradesQuery = `
      WITH top_wallets AS (
        SELECT w.id, w.address, w.label,
               ROW_NUMBER() OVER (ORDER BY m.pnl_30d DESC NULLS LAST) as rank,
               m.pnl_30d,
               m.win_rate_30d
        FROM wallets w
        JOIN wallet_metrics m ON w.id = m.wallet_id
        WHERE w.is_active = true AND w.platform_id = 'hyperliquid'
        ORDER BY m.pnl_30d DESC NULLS LAST
        LIMIT $1
      ),
      coin_trades AS (
        SELECT 
          t.id,
          t.wallet_id,
          t.coin,
          t.side,
          t.size,
          t.price,
          t.closed_pnl,
          t.traded_at,
          t.leverage,
          tw.address,
          tw.label,
          tw.rank,
          tw.pnl_30d,
          tw.win_rate_30d
        FROM trades t
        JOIN top_wallets tw ON t.wallet_id = tw.id
        WHERE t.coin = $2
          AND t.traded_at >= $3
          AND ABS(t.size * t.price) >= $4
        ORDER BY t.traded_at DESC
        LIMIT $5
      )
      SELECT * FROM coin_trades
    `;
    
    result = await db.query(tradesQuery, [topN, coin, effectiveStartTime, minSize, limit]);
    
    // Transform data into trade events
    const events = result.rows.map((row, index) => {
      const sizeNum = parseFloat(row.size);
      const priceNum = parseFloat(row.price);
      const tradeValue = Math.abs(sizeNum * priceNum);
      const isBuy = row.side === 'B';
      const closedPnl = parseFloat(row.closed_pnl || '0');
      const leverage = parseFloat(row.leverage || '1');
      
      let action: string;
      if (Math.abs(closedPnl) > 0.01) {
        action = isBuy ? 'close_short' : 'close_long';
      } else {
        action = isBuy ? 'open_long' : 'open_short';
      }
      
      return {
        id: `${row.id}-${index}`,
        timestamp: new Date(row.traded_at).getTime(),
        address: row.address,
        label: row.label || undefined,
        rank: parseInt(row.rank),
        pnl30d: parseFloat(row.pnl_30d) || 0,
        winRate30d: parseFloat(row.win_rate_30d) || 0,
        action,
        coin: row.coin,
        size: tradeValue,
        price: priceNum,
        leverage: leverage,
        positionBefore: tradeValue,
        positionAfter: tradeValue,
      };
    });
    
    res.json({
      success: true,
      data: events,
      source: 'trades_fallback',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      });
    }
    console.error('Error fetching trade flow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade flow',
    });
  }
});

// Get overview statistics for a specific coin
router.get('/overview', async (req, res) => {
  try {
    const { coin, topN } = overviewQuerySchema.parse(req.query);
    
    const startTime24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Try to get real-time position data from position_states table
    const positionStatsQuery = `
      WITH top_wallets AS (
        SELECT w.id
        FROM wallets w
        JOIN wallet_metrics m ON w.id = m.wallet_id
        WHERE w.is_active = true AND w.platform_id = 'hyperliquid'
        ORDER BY m.pnl_30d DESC NULLS LAST
        LIMIT $1
      ),
      position_stats AS (
        SELECT 
          SUM(CASE WHEN ps.side = 'long' THEN ps.notional_usd ELSE 0 END) as total_long,
          SUM(CASE WHEN ps.side = 'short' THEN ps.notional_usd ELSE 0 END) as total_short,
          COUNT(DISTINCT ps.wallet_id) as unique_holders
        FROM position_states ps
        JOIN top_wallets tw ON ps.wallet_id = tw.id
        WHERE ps.symbol = $2
      ),
      flow_stats AS (
        SELECT 
          SUM(CASE WHEN e.action LIKE '%long%' THEN e.size_change_usd ELSE -e.size_change_usd END) as net_flow,
          SUM(e.size_change_usd) as total_volume,
          COUNT(*) as events_count,
          COUNT(DISTINCT e.wallet_id) as unique_traders
        FROM token_flow_events e
        WHERE e.symbol = $2
          AND e.ts >= $3
          AND e.trader_rank <= $1
      )
      SELECT 
        ps.total_long,
        ps.total_short,
        ps.unique_holders,
        fs.net_flow,
        fs.total_volume,
        fs.events_count,
        fs.unique_traders
      FROM position_stats ps, flow_stats fs
    `;
    
    let result = await db.query(positionStatsQuery, [topN, coin, startTime24h]);
    let row = result.rows[0];
    
    // If we have position data
    if (row && (row.total_long > 0 || row.total_short > 0 || row.events_count > 0)) {
      const totalLong = parseFloat(row.total_long) || 0;
      const totalShort = parseFloat(row.total_short) || 0;
      const netPosition = totalLong - totalShort;
      
      let direction: 'long' | 'short' | 'neutral';
      if (netPosition > 1000) {
        direction = 'long';
      } else if (netPosition < -1000) {
        direction = 'short';
      } else {
        direction = 'neutral';
      }
      
      return res.json({
        success: true,
        data: {
          netLongShort24h: parseFloat(row.net_flow) || 0,
          topHoldersDirection: direction,
          topHoldersNetPosition: Math.abs(netPosition),
          volume24h: parseFloat(row.total_volume) || 0,
          tradesCount24h: parseInt(row.events_count) || 0,
          uniqueTraders24h: parseInt(row.unique_traders) || parseInt(row.unique_holders) || 0,
        },
        source: 'position_engine',
      });
    }
    
    // Fallback to trades table
    const tradesQuery = `
      WITH top_wallets AS (
        SELECT w.id
        FROM wallets w
        JOIN wallet_metrics m ON w.id = m.wallet_id
        WHERE w.is_active = true AND w.platform_id = 'hyperliquid'
        ORDER BY m.pnl_30d DESC NULLS LAST
        LIMIT $1
      ),
      coin_stats AS (
        SELECT 
          SUM(CASE WHEN t.side = 'B' THEN t.size * t.price ELSE -t.size * t.price END) as net_long_short,
          SUM(ABS(t.size * t.price)) as total_volume,
          COUNT(*) as trades_count,
          COUNT(DISTINCT t.wallet_id) as unique_traders
        FROM trades t
        JOIN top_wallets tw ON t.wallet_id = tw.id
        WHERE t.coin = $2
          AND t.traded_at >= $3
      )
      SELECT * FROM coin_stats
    `;
    
    result = await db.query(tradesQuery, [topN, coin, startTime24h]);
    row = result.rows[0];
    
    if (!row) {
      return res.json({
        success: true,
        data: {
          netLongShort24h: 0,
          topHoldersDirection: 'neutral',
          topHoldersNetPosition: 0,
          volume24h: 0,
          tradesCount24h: 0,
          uniqueTraders24h: 0,
        },
      });
    }
    
    const netLongShort = parseFloat(row.net_long_short) || 0;
    
    let direction: 'long' | 'short' | 'neutral';
    if (netLongShort > 1000) {
      direction = 'long';
    } else if (netLongShort < -1000) {
      direction = 'short';
    } else {
      direction = 'neutral';
    }
    
    res.json({
      success: true,
      data: {
        netLongShort24h: netLongShort,
        topHoldersDirection: direction,
        topHoldersNetPosition: Math.abs(netLongShort),
        volume24h: parseFloat(row.total_volume) || 0,
        tradesCount24h: parseInt(row.trades_count) || 0,
        uniqueTraders24h: parseInt(row.unique_traders) || 0,
      },
      source: 'trades_fallback',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      });
    }
    console.error('Error fetching trade overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade overview',
    });
  }
});

export { router as tradesRouter };

