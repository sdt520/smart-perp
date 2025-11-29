import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'smart-perp-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface UserPayload {
  id: number;
  authProvider: 'google' | 'wallet';
  email?: string;
  walletAddress?: string;
}

export interface User {
  id: number;
  google_id: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  auth_provider: 'google' | 'wallet';
  created_at: Date;
}

// Generate JWT token
export function generateToken(user: UserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    return null;
  }
}

// Google OAuth: Create or update user
export async function loginWithGoogle(googleUser: {
  id: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<{ user: User; token: string }> {
  // Check if user exists
  const existing = await db.query<User>(
    'SELECT * FROM users WHERE google_id = $1',
    [googleUser.id]
  );

  let user: User;

  if (existing.rows.length > 0) {
    // Update existing user
    const result = await db.query<User>(
      `UPDATE users SET 
        email = $2, name = $3, avatar_url = $4, last_login_at = NOW()
       WHERE google_id = $1
       RETURNING *`,
      [googleUser.id, googleUser.email, googleUser.name, googleUser.picture]
    );
    user = result.rows[0];
  } else {
    // Create new user
    const result = await db.query<User>(
      `INSERT INTO users (google_id, email, name, avatar_url, auth_provider, last_login_at)
       VALUES ($1, $2, $3, $4, 'google', NOW())
       RETURNING *`,
      [googleUser.id, googleUser.email, googleUser.name, googleUser.picture]
    );
    user = result.rows[0];
  }

  const token = generateToken({
    id: user.id,
    authProvider: 'google',
    email: user.email || undefined,
  });

  return { user, token };
}

// Wallet login: Generate nonce for signing
export async function generateNonce(walletAddress: string): Promise<string> {
  const nonce = `Sign this message to login to Smart Perp Radar.\n\nNonce: ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return nonce;
}

// Wallet login: Verify signature and login
export async function loginWithWallet(
  walletAddress: string,
  message: string,
  signature: string
): Promise<{ user: User; token: string }> {
  // Verify signature
  const recoveredAddress = ethers.verifyMessage(message, signature);
  
  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Invalid signature');
  }

  const normalizedAddress = walletAddress.toLowerCase();

  // Check if user exists
  const existing = await db.query<User>(
    'SELECT * FROM users WHERE wallet_address = $1',
    [normalizedAddress]
  );

  let user: User;

  if (existing.rows.length > 0) {
    // Update last login
    const result = await db.query<User>(
      `UPDATE users SET last_login_at = NOW()
       WHERE wallet_address = $1
       RETURNING *`,
      [normalizedAddress]
    );
    user = result.rows[0];
  } else {
    // Create new user
    const result = await db.query<User>(
      `INSERT INTO users (wallet_address, auth_provider, last_login_at)
       VALUES ($1, 'wallet', NOW())
       RETURNING *`,
      [normalizedAddress]
    );
    user = result.rows[0];
  }

  const token = generateToken({
    id: user.id,
    authProvider: 'wallet',
    walletAddress: user.wallet_address || undefined,
  });

  return { user, token };
}

// Get user by ID
export async function getUserById(userId: number): Promise<User | null> {
  const result = await db.query<User>(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

