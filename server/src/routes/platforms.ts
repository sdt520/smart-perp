import { Router } from 'express';
import db from '../db/index.js';
import type { Platform } from '../types/index.js';

const router = Router();

// GET /api/platforms - Get all platforms
router.get('/', async (_req, res) => {
  try {
    const query = `
      SELECT id, name, api_base_url, is_enabled, created_at, updated_at
      FROM platforms
      ORDER BY name
    `;
    const result = await db.query<Platform>(query);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching platforms:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/platforms/:id - Get single platform
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT id, name, api_base_url, is_enabled, created_at, updated_at
      FROM platforms
      WHERE id = $1
    `;
    const result = await db.query<Platform>(query, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Platform not found',
      });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching platform:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;


