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

// Get trade flow for a specific coin
router.get('/flow', async (req, res) => {
  try {
    const { coin, startTime, topN, minSize, limit } = flowQuerySchema.parse(req.query);
    
    // Default to last 24 hours if no startTime
    const effectiveStartTime = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Query trades from top N wallets for the specified coin
    const query = `
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
    
    const result = await db.query(query, [topN, coin, effectiveStartTime, minSize, limit]);
    
    // Transform data into trade events
    const events = result.rows.map((row, index) => {
      const sizeNum = parseFloat(row.size);
      const priceNum = parseFloat(row.price);
      const tradeValue = Math.abs(sizeNum * priceNum);
      const isBuy = row.side === 'B';
      const closedPnl = parseFloat(row.closed_pnl || '0');
      const leverage = parseFloat(row.leverage || '1');
      
      // Determine action type based on side and closedPnl
      // If closedPnl is non-zero, it's likely a close/reduce position
      let action: string;
      if (Math.abs(closedPnl) > 0.01) {
        // Has realized PnL, likely closing position
        action = isBuy ? 'close_short' : 'close_long';
      } else {
        // No realized PnL, likely opening/adding
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
        positionBefore: tradeValue, // Simplified - we don't have position data
        positionAfter: tradeValue,
      };
    });
    
    res.json({
      success: true,
      data: events,
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
    
    // Query aggregated stats
    const query = `
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
      ),
      current_positions AS (
        SELECT 
          SUM(
            CASE 
              WHEN t.side = 'B' THEN t.size 
              ELSE -t.size 
            END
          ) as net_position_size
        FROM trades t
        JOIN top_wallets tw ON t.wallet_id = tw.id
        WHERE t.coin = $2
      )
      SELECT 
        cs.net_long_short,
        cs.total_volume,
        cs.trades_count,
        cs.unique_traders,
        cp.net_position_size
      FROM coin_stats cs, current_positions cp
    `;
    
    const result = await db.query(query, [topN, coin, startTime24h]);
    const row = result.rows[0];
    
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
    const netPosition = parseFloat(row.net_position_size) || 0;
    
    // Determine direction based on net position
    let direction: 'long' | 'short' | 'neutral';
    if (netPosition > 0.01) {
      direction = 'long';
    } else if (netPosition < -0.01) {
      direction = 'short';
    } else {
      direction = 'neutral';
    }
    
    res.json({
      success: true,
      data: {
        netLongShort24h: netLongShort,
        topHoldersDirection: direction,
        topHoldersNetPosition: Math.abs(netPosition * 100000), // Approximate USD value
        volume24h: parseFloat(row.total_volume) || 0,
        tradesCount24h: parseInt(row.trades_count) || 0,
        uniqueTraders24h: parseInt(row.unique_traders) || 0,
      },
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

