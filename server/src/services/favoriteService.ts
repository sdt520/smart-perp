import db from '../db/index.js';

export interface Favorite {
  id: number;
  user_id: number;
  wallet_id: number;
  created_at: Date;
}

// Add a wallet to favorites
export async function addFavorite(userId: number, walletId: number): Promise<Favorite> {
  const result = await db.query<Favorite>(
    `INSERT INTO user_favorites (user_id, wallet_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, wallet_id) DO NOTHING
     RETURNING *`,
    [userId, walletId]
  );
  
  // If already exists, fetch it
  if (result.rows.length === 0) {
    const existing = await db.query<Favorite>(
      'SELECT * FROM user_favorites WHERE user_id = $1 AND wallet_id = $2',
      [userId, walletId]
    );
    return existing.rows[0];
  }
  
  return result.rows[0];
}

// Remove a wallet from favorites
export async function removeFavorite(userId: number, walletId: number): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM user_favorites WHERE user_id = $1 AND wallet_id = $2',
    [userId, walletId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Check if a wallet is favorited
export async function isFavorited(userId: number, walletId: number): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM user_favorites WHERE user_id = $1 AND wallet_id = $2)',
    [userId, walletId]
  );
  return result.rows[0]?.exists ?? false;
}

// Get all favorites for a user
export async function getUserFavorites(userId: number): Promise<number[]> {
  const result = await db.query<{ wallet_id: number }>(
    'SELECT wallet_id FROM user_favorites WHERE user_id = $1',
    [userId]
  );
  return result.rows.map(r => r.wallet_id);
}

// Get favorite wallet IDs by wallet addresses (for batch checking)
export async function getFavoritesByAddresses(
  userId: number,
  addresses: string[]
): Promise<Set<string>> {
  if (addresses.length === 0) return new Set();
  
  const result = await db.query<{ address: string }>(
    `SELECT w.address
     FROM user_favorites uf
     JOIN wallets w ON uf.wallet_id = w.id
     WHERE uf.user_id = $1 AND w.address = ANY($2)`,
    [userId, addresses]
  );
  
  return new Set(result.rows.map(r => r.address.toLowerCase()));
}

// Add favorite by wallet address
export async function addFavoriteByAddress(
  userId: number,
  walletAddress: string
): Promise<boolean> {
  const result = await db.query<{ id: number }>(
    'SELECT id FROM wallets WHERE LOWER(address) = LOWER($1)',
    [walletAddress]
  );
  
  if (result.rows.length === 0) {
    return false;
  }
  
  await addFavorite(userId, result.rows[0].id);
  return true;
}

// Remove favorite by wallet address
export async function removeFavoriteByAddress(
  userId: number,
  walletAddress: string
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM user_favorites
     WHERE user_id = $1 AND wallet_id = (
       SELECT id FROM wallets WHERE LOWER(address) = LOWER($2)
     )`,
    [userId, walletAddress]
  );
  return (result.rowCount ?? 0) > 0;
}

