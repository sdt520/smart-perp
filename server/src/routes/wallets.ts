import { Router } from 'express';
import { z } from 'zod';
import * as walletService from '../services/walletService.js';
import db from '../db/index.js';
import type { SortField, SortDirection } from '../types/index.js';

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

// GET /api/wallets/:id - Get single wallet
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

