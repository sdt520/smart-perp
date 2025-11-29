import { Router } from 'express';
import { z } from 'zod';
import * as walletService from '../services/walletService.js';
import db from '../db/index.js';
import type { SortField, SortDirection } from '../types/index.js';

// Hyperliquid API base URL
const HL_API_BASE = 'https://api.hyperliquid.xyz';

// Portfolio API response types
interface PortfolioTimeframeData {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
}

// Fetch user stats from Hyperliquid Portfolio API
// https://docs.chainstack.com/reference/hyperliquid-info-portfolio
async function fetchHyperliquidUserStats(address: string): Promise<{
  pnl1d: number;
  pnl7d: number;
  pnl30d: number;
  volume1d: number;
  volume7d: number;
  volume30d: number;
} | null> {
  try {
    // Use the portfolio API to get PnL data for multiple timeframes
    const response = await fetch(`${HL_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'portfolio',
        user: address,
      }),
    });
    
    if (!response.ok) return null;
    
    const portfolioData: [string, PortfolioTimeframeData][] = await response.json();
    
    // Extract PnL from each timeframe
    // perpDay = 1D, perpWeek = 7D, perpMonth = 30D
    let pnl1d = 0;
    let pnl7d = 0;
    let pnl30d = 0;
    let volume1d = 0;
    let volume7d = 0;
    let volume30d = 0;
    
    for (const [timeframe, data] of portfolioData) {
      if (!data.pnlHistory || data.pnlHistory.length === 0) continue;
      
      // Get the latest PnL value (cumulative PnL for the period)
      const latestPnl = parseFloat(data.pnlHistory[data.pnlHistory.length - 1][1] || '0');
      const volume = parseFloat(data.vlm || '0');
      
      switch (timeframe) {
        case 'perpDay':
          pnl1d = latestPnl;
          volume1d = volume;
          break;
        case 'perpWeek':
          pnl7d = latestPnl;
          volume7d = volume;
          break;
        case 'perpMonth':
          pnl30d = latestPnl;
          volume30d = volume;
          break;
      }
    }
    
    return {
      pnl1d,
      pnl7d,
      pnl30d,
      volume1d,
      volume7d,
      volume30d,
    };
  } catch (error) {
    console.error('Error fetching Hyperliquid user stats:', error);
    return null;
  }
}

const router = Router();

// Query params schema
const listQuerySchema = z.object({
  platform: z.string().optional(),
  search: z.string().optional(), // Search by address or label
  sortBy: z.enum([
    'pnl_1d',
    'pnl_7d',
    'pnl_30d',
    'win_rate_7d',
    'win_rate_30d',
    'trades_count_7d',
    'trades_count_30d',
  ]).optional().default('pnl_30d'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// GET /api/wallets - Get wallet leaderboard
router.get('/', async (req, res) => {
  try {
    const query = listQuerySchema.parse(req.query);
    
    const result = await walletService.getWalletLeaderboard({
      platformId: query.platform,
      search: query.search,
      sortBy: query.sortBy as SortField,
      sortDir: query.sortDir as SortDirection,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + result.data.length < result.total,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }
    console.error('Error fetching wallets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/wallets/stats - Get aggregate stats
router.get('/stats', async (req, res) => {
  try {
    const platform = req.query.platform as string | undefined;
    const stats = await walletService.getStats(platform);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/wallets/last-sync - Get last sync time
router.get('/last-sync', async (_req, res) => {
  try {
    // Get the most recent completed sync job
    const result = await db.query<{
      job_type: string;
      completed_at: Date;
    }>(`
      SELECT job_type, completed_at
      FROM sync_jobs
      WHERE status = 'completed' AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      res.json({
        success: true,
        data: {
          lastSyncAt: null,
          jobType: null,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        lastSyncAt: result.rows[0].completed_at,
        jobType: result.rows[0].job_type,
      },
    });
  } catch (error) {
    console.error('Error fetching last sync:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/wallets/address/:address - Get wallet by address
// Supports both database wallets and arbitrary addresses (fetched from Hyperliquid)
router.get('/address/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const platform = (req.query.platform as string) || 'hyperliquid';
    
    // First try to find in database
    const wallet = await walletService.getWalletByAddress(address, platform);
    if (wallet) {
      res.json({
        success: true,
        data: wallet,
        source: 'database',
      });
      return;
    }

    // If not in database and it's a valid Ethereum address, fetch from Hyperliquid
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      console.log(`Fetching external address from Hyperliquid: ${address}`);
      const hlStats = await fetchHyperliquidUserStats(address);
      
      if (hlStats) {
        // Return data in the same format as database wallets
        // Using Hyperliquid Portfolio API for 1D, 7D, 30D PnL
        res.json({
          success: true,
          data: {
            id: null, // Not in database
            address: address.toLowerCase(),
            platform_id: 'hyperliquid',
            platform_name: 'Hyperliquid',
            twitter_handle: null,
            label: null,
            pnl_1d: hlStats.pnl1d,
            pnl_7d: hlStats.pnl7d,
            pnl_30d: hlStats.pnl30d,
            win_rate_7d: 0, // Not available from portfolio API
            win_rate_30d: 0, // Not available from portfolio API
            trades_count_7d: 0, // Not available from portfolio API
            trades_count_30d: 0, // Not available from portfolio API
            total_volume_7d: hlStats.volume7d,
            total_volume_30d: hlStats.volume30d,
            last_trade_at: null,
            calculated_at: new Date().toISOString(),
            rank: null, // Not in leaderboard
          },
          source: 'hyperliquid_api',
        });
        return;
      }
    }

    res.status(404).json({
      success: false,
      error: 'Wallet not found',
    });
  } catch (error) {
    console.error('Error fetching wallet by address:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/wallets/address/:address/pnl-history - Get PnL history for a wallet
router.get('/address/:address/pnl-history', async (req, res) => {
  try {
    const { address } = req.params;
    const platform = (req.query.platform as string) || 'hyperliquid';
    const days = parseInt(req.query.days as string) || 30;
    
    const pnlHistory = await walletService.getWalletPnlHistory(address, platform, days);

    res.json({
      success: true,
      data: pnlHistory,
    });
  } catch (error) {
    console.error('Error fetching PnL history:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/wallets/:id - Get single wallet by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet ID',
      });
      return;
    }

    const wallet = await walletService.getWalletById(id);
    if (!wallet) {
      res.status(404).json({
        success: false,
        error: 'Wallet not found',
      });
      return;
    }

    res.json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;

