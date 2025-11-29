import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';

const router = Router();

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email?: string;
        name?: string;
        walletAddress?: string;
        authProvider: 'google' | 'wallet';
      };
    }
  }
}

// 认证中间件
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
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

    const user = await authService.getUserById(payload.id);
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      walletAddress: user.wallet_address ?? undefined,
      authProvider: user.auth_provider as 'google' | 'wallet',
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

// Google OAuth login
const googleLoginSchema = z.object({
  credential: z.string(), // Google ID token
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = googleLoginSchema.parse(req.body);
    
    // Decode Google ID token (in production, verify with Google's API)
    // For simplicity, we'll decode the JWT payload
    const payload = JSON.parse(
      Buffer.from(credential.split('.')[1], 'base64').toString()
    );
    
    const { user, token } = await authService.loginWithGoogle({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          authProvider: user.auth_provider,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
});

// Wallet login - Step 1: Get nonce
router.post('/wallet/nonce', async (req, res) => {
  try {
    const { address } = z.object({ address: z.string() }).parse(req.body);
    const nonce = await authService.generateNonce(address);
    
    res.json({
      success: true,
      data: { nonce },
    });
  } catch (error) {
    console.error('Nonce generation error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to generate nonce',
    });
  }
});

// Wallet login - Step 2: Verify signature
const walletLoginSchema = z.object({
  address: z.string(),
  message: z.string(),
  signature: z.string(),
});

router.post('/wallet/verify', async (req, res) => {
  try {
    const { address, message, signature } = walletLoginSchema.parse(req.body);
    
    const { user, token } = await authService.loginWithWallet(
      address,
      message,
      signature
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          walletAddress: user.wallet_address,
          authProvider: user.auth_provider,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Wallet login error:', error);
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
});

// Get current user (verify token)
router.get('/me', async (req, res) => {
  try {
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

    const user = await authService.getUserById(payload.id);
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          walletAddress: user.wallet_address,
          authProvider: user.auth_provider,
        },
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Logout (client-side token removal, but we can log it)
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

export default router;

