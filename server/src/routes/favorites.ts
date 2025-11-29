import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import * as favoriteService from '../services/favoriteService.js';
import * as walletService from '../services/walletService.js';

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

// Get user's favorite wallet addresses
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const favoriteWalletIds = await favoriteService.getUserFavorites(userId);
    
    res.json({
      success: true,
      data: { walletIds: favoriteWalletIds },
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Get favorite wallets with full details
router.get('/wallets', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    
    // Get favorite wallets with details
    const result = await walletService.getFavoriteWallets(userId);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get favorite wallets error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Check favorites status for multiple addresses
router.post('/check', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { addresses } = z.object({
      addresses: z.array(z.string()),
    }).parse(req.body);
    
    const favorited = await favoriteService.getFavoritesByAddresses(userId, addresses);
    
    res.json({
      success: true,
      data: { favorited: Array.from(favorited) },
    });
  } catch (error) {
    console.error('Check favorites error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Add to favorites (supports any Ethereum address)
router.post('/:address', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { address } = req.params;
    
    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid Ethereum address format',
      });
      return;
    }
    
    await favoriteService.addFavoriteByAddress(userId, address);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Remove from favorites
router.delete('/:address', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { address } = req.params;
    
    await favoriteService.removeFavoriteByAddress(userId, address);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;

