import db from '../db/index.js';

export interface Favorite {
  id: number;
  user_id: number;
  wallet_id: number | null;
  wallet_address: string;
  created_at: Date;
}

// Add a wallet to favorites by address (supports any address)
export async function addFavoriteByAddress(
  userId: number,
  walletAddress: string
): Promise<Favorite> {
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Try to find wallet_id if it exists in database
  const walletResult = await db.query<{ id: number }>(
    'SELECT id FROM wallets WHERE LOWER(address) = $1',
    [normalizedAddress]
  );
  
  const walletId = walletResult.rows[0]?.id || null;
  
  const result = await db.query<Favorite>(
    `INSERT INTO user_favorites (user_id, wallet_id, wallet_address)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, wallet_address) DO NOTHING
     RETURNING *`,
    [userId, walletId, normalizedAddress]
  );
  
  // If already exists, fetch it
  if (result.rows.length === 0) {
    const existing = await db.query<Favorite>(
      'SELECT * FROM user_favorites WHERE user_id = $1 AND wallet_address = $2',
      [userId, normalizedAddress]
    );
    return existing.rows[0];
  }
  
  return result.rows[0];
}

// Remove favorite by wallet address
export async function removeFavoriteByAddress(
  userId: number,
  walletAddress: string
): Promise<boolean> {
  const normalizedAddress = walletAddress.toLowerCase();
  const result = await db.query(
    'DELETE FROM user_favorites WHERE user_id = $1 AND wallet_address = $2',
    [userId, normalizedAddress]
  );
  return (result.rowCount ?? 0) > 0;
}

// Check if a wallet is favorited by address
export async function isFavoritedByAddress(
  userId: number,
  walletAddress: string
): Promise<boolean> {
  const normalizedAddress = walletAddress.toLowerCase();
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM user_favorites WHERE user_id = $1 AND wallet_address = $2)',
    [userId, normalizedAddress]
  );
  return result.rows[0]?.exists ?? false;
}

// Get all favorite addresses for a user
export async function getUserFavoriteAddresses(userId: number): Promise<string[]> {
  const result = await db.query<{ wallet_address: string }>(
    'SELECT wallet_address FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map(r => r.wallet_address);
}

// Get favorite wallet addresses for batch checking
export async function getFavoritesByAddresses(
  userId: number,
  addresses: string[]
): Promise<Set<string>> {
  if (addresses.length === 0) return new Set();
  
  const normalizedAddresses = addresses.map(a => a.toLowerCase());
  
  const result = await db.query<{ wallet_address: string }>(
    `SELECT wallet_address
     FROM user_favorites
     WHERE user_id = $1 AND wallet_address = ANY($2)`,
    [userId, normalizedAddresses]
  );
  
  return new Set(result.rows.map(r => r.wallet_address.toLowerCase()));
}

// Legacy functions for backwards compatibility
export async function addFavorite(userId: number, walletId: number): Promise<Favorite> {
  const walletResult = await db.query<{ address: string }>(
    'SELECT address FROM wallets WHERE id = $1',
    [walletId]
  );
  
  if (walletResult.rows.length === 0) {
    throw new Error('Wallet not found');
  }
  
  return addFavoriteByAddress(userId, walletResult.rows[0].address);
}

export async function removeFavorite(userId: number, walletId: number): Promise<boolean> {
  const walletResult = await db.query<{ address: string }>(
    'SELECT address FROM wallets WHERE id = $1',
    [walletId]
  );
  
  if (walletResult.rows.length === 0) {
    return false;
  }
  
  return removeFavoriteByAddress(userId, walletResult.rows[0].address);
}

export async function isFavorited(userId: number, walletId: number): Promise<boolean> {
  const walletResult = await db.query<{ address: string }>(
    'SELECT address FROM wallets WHERE id = $1',
    [walletId]
  );
  
  if (walletResult.rows.length === 0) {
    return false;
  }
  
  return isFavoritedByAddress(userId, walletResult.rows[0].address);
}

export async function getUserFavorites(userId: number): Promise<number[]> {
  const result = await db.query<{ wallet_id: number }>(
    'SELECT wallet_id FROM user_favorites WHERE user_id = $1 AND wallet_id IS NOT NULL',
    [userId]
  );
  return result.rows.map(r => r.wallet_id);
}
