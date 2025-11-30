import db from '../db/index.js';
import type { WalletLeaderboardItem, SortField, SortDirection } from '../types/index.js';

const VALID_SORT_FIELDS: SortField[] = [
  'pnl_1d',
  'pnl_7d',
  'pnl_30d',
  'win_rate_7d',
  'win_rate_30d',
  'trades_count_7d',
  'trades_count_30d',
];

export interface GetWalletsParams {
  platformId?: string;
  search?: string;
  sortBy?: SortField;
  sortDir?: SortDirection;
  limit?: number;
  offset?: number;
}

export async function getWalletLeaderboard(params: GetWalletsParams): Promise<{
  data: WalletLeaderboardItem[];
  total: number;
}> {
  const {
    platformId,
    search,
    sortBy = 'pnl_30d',
    sortDir = 'desc',
    limit = 50,
    offset = 0,
  } = params;

  // Validate sort field to prevent SQL injection
  const safeSortField = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'pnl_30d';
  const safeSortDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE conditions for count query (starting from $1)
  const countConditions: string[] = ['w.is_active = true'];
  const countParams: (string | number)[] = [];
  let countParamIndex = 0;

  // Build WHERE conditions for main query (starting from $3, since $1=limit, $2=offset)
  const queryConditions: string[] = ['w.is_active = true'];
  const queryParams: (string | number)[] = [limit, offset];
  let queryParamIndex = 2;

  if (platformId) {
    countParamIndex++;
    queryParamIndex++;
    countConditions.push(`w.platform_id = $${countParamIndex}`);
    queryConditions.push(`w.platform_id = $${queryParamIndex}`);
    countParams.push(platformId);
    queryParams.push(platformId);
  }

  if (search) {
    countParamIndex++;
    queryParamIndex++;
    const searchPattern = `%${search.toLowerCase()}%`;
    countConditions.push(`(LOWER(w.address) LIKE $${countParamIndex} OR LOWER(COALESCE(w.label, '')) LIKE $${countParamIndex})`);
    queryConditions.push(`(LOWER(w.address) LIKE $${queryParamIndex} OR LOWER(COALESCE(w.label, '')) LIKE $${queryParamIndex})`);
    countParams.push(searchPattern);
    queryParams.push(searchPattern);
  }

  const countWhereClause = countConditions.length > 0 ? `WHERE ${countConditions.join(' AND ')}` : '';
  const queryWhereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM wallets w
    ${countWhereClause}
  `;
  const countResult = await db.query<{ total: string }>(countQuery, countParams);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // Get paginated data with rank
  // First, create a subquery to get ranks based on the sort field across ALL wallets
  const query = `
    WITH ranked_wallets AS (
      SELECT 
        w.id,
        w.address,
        w.platform_id,
        p.name AS platform_name,
        w.twitter_handle,
        w.label,
        COALESCE(m.pnl_1d, 0)::float AS pnl_1d,
        COALESCE(m.pnl_7d, 0)::float AS pnl_7d,
        COALESCE(m.pnl_30d, 0)::float AS pnl_30d,
        COALESCE(m.win_rate_7d, 0)::float AS win_rate_7d,
        COALESCE(m.win_rate_30d, 0)::float AS win_rate_30d,
        COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
        COALESCE(m.trades_count_30d, 0) AS trades_count_30d,
        COALESCE(m.total_volume_7d, 0)::float AS total_volume_7d,
        COALESCE(m.total_volume_30d, 0)::float AS total_volume_30d,
        m.last_trade_at,
        m.calculated_at,
        ROW_NUMBER() OVER (ORDER BY ${safeSortField} ${safeSortDir} NULLS LAST, w.address ASC) AS rank
      FROM wallets w
      JOIN platforms p ON w.platform_id = p.id
      LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
      WHERE w.is_active = true
    )
    SELECT * FROM ranked_wallets
    ${search ? `WHERE LOWER(address) LIKE $3 OR LOWER(COALESCE(label, '')) LIKE $3` : ''}
    ORDER BY ${safeSortField} ${safeSortDir} NULLS LAST, address ASC
    LIMIT $1 OFFSET $2
  `;
  
  // Adjust params for search case
  const finalParams = search 
    ? [limit, offset, `%${search.toLowerCase()}%`]
    : [limit, offset];

  const result = await db.query<WalletLeaderboardItem & { rank: number }>(query, finalParams);

  return {
    data: result.rows,
    total,
  };
}

export async function getWalletById(id: number): Promise<WalletLeaderboardItem | null> {
  const query = `
    SELECT 
      w.id,
      w.address,
      w.platform_id,
      p.name AS platform_name,
      w.twitter_handle,
      w.label,
      COALESCE(m.pnl_1d, 0)::float AS pnl_1d,
      COALESCE(m.pnl_7d, 0)::float AS pnl_7d,
      COALESCE(m.pnl_30d, 0)::float AS pnl_30d,
      COALESCE(m.win_rate_7d, 0)::float AS win_rate_7d,
      COALESCE(m.win_rate_30d, 0)::float AS win_rate_30d,
      COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
      COALESCE(m.trades_count_30d, 0) AS trades_count_30d,
      COALESCE(m.total_volume_7d, 0)::float AS total_volume_7d,
      COALESCE(m.total_volume_30d, 0)::float AS total_volume_30d,
      m.last_trade_at,
      m.calculated_at
    FROM wallets w
    JOIN platforms p ON w.platform_id = p.id
    LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
    WHERE w.id = $1
  `;

  const result = await db.query<WalletLeaderboardItem>(query, [id]);
  return result.rows[0] || null;
}

export async function getWalletByAddress(
  address: string,
  platformId: string
): Promise<(WalletLeaderboardItem & { rank?: number }) | null> {
  // Use a CTE to calculate rank based on pnl_30d
  const query = `
    WITH ranked_wallets AS (
      SELECT 
        w.id,
        w.address,
        w.platform_id,
        p.name AS platform_name,
        w.twitter_handle,
        w.label,
        COALESCE(m.pnl_1d, 0)::float AS pnl_1d,
        COALESCE(m.pnl_7d, 0)::float AS pnl_7d,
        COALESCE(m.pnl_30d, 0)::float AS pnl_30d,
        COALESCE(m.win_rate_7d, 0)::float AS win_rate_7d,
        COALESCE(m.win_rate_30d, 0)::float AS win_rate_30d,
        COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
        COALESCE(m.trades_count_30d, 0) AS trades_count_30d,
        COALESCE(m.total_volume_7d, 0)::float AS total_volume_7d,
        COALESCE(m.total_volume_30d, 0)::float AS total_volume_30d,
        m.last_trade_at,
        m.calculated_at,
        ROW_NUMBER() OVER (ORDER BY m.pnl_30d DESC NULLS LAST, w.address ASC) AS rank
      FROM wallets w
      JOIN platforms p ON w.platform_id = p.id
      LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
      WHERE w.is_active = true
    )
    SELECT * FROM ranked_wallets
    WHERE address = $1 AND platform_id = $2
  `;

  const result = await db.query<WalletLeaderboardItem & { rank: number }>(query, [address, platformId]);
  return result.rows[0] || null;
}

export async function getStats(platformId?: string): Promise<{
  totalWallets: number;
  totalPnl30d: number;
  avgWinRate: number;
  totalVolume30d: number;
  topPerformer: WalletLeaderboardItem | null;
}> {
  const whereClause = platformId ? 'WHERE w.platform_id = $1 AND w.is_active = true' : 'WHERE w.is_active = true';
  const params = platformId ? [platformId] : [];

  const query = `
    SELECT 
      COUNT(w.id)::int AS total_wallets,
      COALESCE(SUM(m.pnl_30d), 0)::float AS total_pnl_30d,
      COALESCE(AVG(m.win_rate_30d), 0)::float AS avg_win_rate,
      COALESCE(SUM(m.total_volume_30d), 0)::float AS total_volume_30d
    FROM wallets w
    LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
    ${whereClause}
  `;

  const result = await db.query<{
    total_wallets: number;
    total_pnl_30d: number;
    avg_win_rate: number;
    total_volume_30d: number;
  }>(query, params);

  const stats = result.rows[0];

  // Get top performer
  const { data: topPerformers } = await getWalletLeaderboard({
    platformId,
    sortBy: 'pnl_30d',
    sortDir: 'desc',
    limit: 1,
  });

  return {
    totalWallets: stats?.total_wallets || 0,
    totalPnl30d: stats?.total_pnl_30d || 0,
    avgWinRate: stats?.avg_win_rate || 0,
    totalVolume30d: stats?.total_volume_30d || 0,
    topPerformer: topPerformers[0] || null,
  };
}

export interface PnlHistoryItem {
  date: string;
  pnl: number;
  cumulativePnl: number;
  tradesCount: number;
  winRate: number;
  volume: number;
}

export async function getWalletPnlHistory(
  address: string,
  platformId: string,
  days = 30
): Promise<PnlHistoryItem[]> {
  const query = `
    SELECT 
      s.snapshot_date,
      COALESCE(s.pnl_1d, 0)::float AS pnl_1d,
      COALESCE(s.cumulative_pnl, 0)::float AS cumulative_pnl,
      COALESCE(s.trades_count, 0) AS trades_count,
      COALESCE(s.win_rate, 0)::float AS win_rate,
      COALESCE(s.volume, 0)::float AS volume
    FROM daily_pnl_snapshots s
    JOIN wallets w ON s.wallet_id = w.id
    WHERE w.address = $1 AND w.platform_id = $2
    ORDER BY s.snapshot_date DESC
    LIMIT $3
  `;

  const result = await db.query<{
    snapshot_date: Date;
    pnl_1d: number;
    cumulative_pnl: number;
    trades_count: number;
    win_rate: number;
    volume: number;
  }>(query, [address, platformId, days]);

  // Return in chronological order (oldest first)
  return result.rows.reverse().map(row => ({
    date: row.snapshot_date.toISOString().split('T')[0],
    pnl: row.pnl_1d,
    cumulativePnl: row.cumulative_pnl,
    tradesCount: row.trades_count,
    winRate: row.win_rate,
    volume: row.volume,
  }));
}

// Get favorite wallets for a user (supports both database wallets and external addresses)
export async function getFavoriteWallets(userId: number): Promise<(WalletLeaderboardItem & { rank?: number })[]> {
  // First get all favorite addresses
  const favoritesQuery = `
    SELECT 
      uf.wallet_address,
      uf.wallet_id,
      uf.created_at as favorited_at
    FROM user_favorites uf
    WHERE uf.user_id = $1
    ORDER BY uf.created_at DESC
  `;
  
  const favoritesResult = await db.query<{ wallet_address: string; wallet_id: number | null; favorited_at: Date }>(
    favoritesQuery, 
    [userId]
  );
  
  if (favoritesResult.rows.length === 0) {
    return [];
  }
  
  // Get database wallets with full details
  const dbWalletsQuery = `
    WITH ranked_wallets AS (
      SELECT 
        w.id,
        w.address,
        w.platform_id,
        p.name AS platform_name,
        w.twitter_handle,
        w.label,
        COALESCE(m.pnl_1d, 0)::float AS pnl_1d,
        COALESCE(m.pnl_7d, 0)::float AS pnl_7d,
        COALESCE(m.pnl_30d, 0)::float AS pnl_30d,
        COALESCE(m.win_rate_7d, 0)::float AS win_rate_7d,
        COALESCE(m.win_rate_30d, 0)::float AS win_rate_30d,
        COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
        COALESCE(m.trades_count_30d, 0) AS trades_count_30d,
        COALESCE(m.total_volume_7d, 0)::float AS total_volume_7d,
        COALESCE(m.total_volume_30d, 0)::float AS total_volume_30d,
        m.last_trade_at,
        m.calculated_at,
        ROW_NUMBER() OVER (ORDER BY m.pnl_30d DESC NULLS LAST, w.address ASC) as rank
      FROM wallets w
      JOIN platforms p ON w.platform_id = p.id
      LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
      WHERE w.is_active = true
    )
    SELECT * FROM ranked_wallets
    WHERE LOWER(address) = ANY($1)
  `;
  
  const addresses = favoritesResult.rows.map(f => f.wallet_address.toLowerCase());
  const dbWalletsResult = await db.query<WalletLeaderboardItem & { rank: number }>(dbWalletsQuery, [addresses]);
  
  // Create a map of address -> wallet data
  const walletMap = new Map<string, WalletLeaderboardItem & { rank?: number }>();
  for (const wallet of dbWalletsResult.rows) {
    walletMap.set(wallet.address.toLowerCase(), wallet);
  }
  
  // Build result in favorites order, including external addresses
  const result: (WalletLeaderboardItem & { rank?: number })[] = [];
  for (const fav of favoritesResult.rows) {
    const address = fav.wallet_address.toLowerCase();
    const dbWallet = walletMap.get(address);
    
    if (dbWallet) {
      result.push(dbWallet);
    } else {
      // External address - return basic info
      result.push({
        id: null as unknown as number,
        address: fav.wallet_address,
        platform_id: 'hyperliquid',
        platform_name: 'Hyperliquid',
        twitter_handle: null,
        label: null,
        pnl_1d: 0,
        pnl_7d: 0,
        pnl_30d: 0,
        win_rate_7d: 0,
        win_rate_30d: 0,
        trades_count_7d: 0,
        trades_count_30d: 0,
        total_volume_7d: 0,
        total_volume_30d: 0,
        last_trade_at: null,
        calculated_at: null,
        rank: undefined,
      });
    }
  }
  
  return result;
}

