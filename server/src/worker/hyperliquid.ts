import db from '../db/index.js';
import type { HyperliquidFill } from '../types/index.js';

const API_BASE = 'https://api.hyperliquid.xyz';
const STATS_API = 'https://stats-data.hyperliquid.xyz/Mainnet';
const PLATFORM_ID = 'hyperliquid';

// 排行榜数据结构
interface LeaderboardEntry {
  ethAddress: string;
  accountValue: string;
  windowPerformances: Array<[string, { pnl: string; roi: string; vlm: string }]>;
  displayName: string | null;
}

interface LeaderboardResponse {
  leaderboardRows: LeaderboardEntry[];
}

async function fetchInfo<T>(request: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch leaderboard from Hyperliquid Stats API
 */
async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  console.log('📥 Fetching Hyperliquid leaderboard from stats API...');
  
  const response = await fetch(`${STATS_API}/leaderboard`);
  
  if (!response.ok) {
    throw new Error(`Leaderboard API error: ${response.status}`);
  }
  
  const data = await response.json() as LeaderboardResponse;
  return data.leaderboardRows || [];
}

/**
 * Fetch user fills (trades) for a specific address
 */
export async function fetchUserFillsByTime(
  address: string,
  startTime: number,
  endTime?: number
): Promise<HyperliquidFill[]> {
  return fetchInfo<HyperliquidFill[]>({
    type: 'userFillsByTime',
    user: address,
    startTime,
    endTime,
  });
}

/**
 * Sync leaderboard data - automatically fetch top traders from Hyperliquid
 */
export async function syncLeaderboard(): Promise<number> {
  console.log('🏆 Starting leaderboard sync...');
  
  const leaderboard = await fetchLeaderboard();
  console.log(`📊 Found ${leaderboard.length} traders on leaderboard`);
  
  let newWallets = 0;
  let updatedWallets = 0;

  // Only process top 1000 wallets with positive monthly PnL
  const topWallets = leaderboard
    .filter(entry => {
      const monthPerf = entry.windowPerformances.find(([period]) => period === 'month');
      return monthPerf && parseFloat(monthPerf[1].pnl) > 0;
    })
    .slice(0, 1000);

  console.log(`📈 Processing top ${topWallets.length} profitable wallets...`);

  for (const entry of topWallets) {
    const address = entry.ethAddress.toLowerCase();
    
    // Get performance data
    const dayPerf = entry.windowPerformances.find(([p]) => p === 'day')?.[1];
    const weekPerf = entry.windowPerformances.find(([p]) => p === 'week')?.[1];
    const monthPerf = entry.windowPerformances.find(([p]) => p === 'month')?.[1];
    
    // Check if wallet exists
    const existing = await db.query<{ id: number }>(
      'SELECT id FROM wallets WHERE address = $1 AND platform_id = $2',
      [address, PLATFORM_ID]
    );

    let walletId: number;

    if (existing.rows.length === 0) {
      // Insert new wallet
      const result = await db.query<{ id: number }>(
        `INSERT INTO wallets (address, platform_id, label, is_active, discovered_at)
         VALUES ($1, $2, $3, true, NOW())
         RETURNING id`,
        [address, PLATFORM_ID, entry.displayName]
      );
      walletId = result.rows[0].id;
      newWallets++;
      console.log(`  ✅ New: ${address.slice(0, 10)}...${entry.displayName ? ` (${entry.displayName})` : ''}`);
    } else {
      walletId = existing.rows[0].id;
      // Update display name if available
      if (entry.displayName) {
        await db.query(
          'UPDATE wallets SET label = $1, updated_at = NOW() WHERE id = $2',
          [entry.displayName, walletId]
        );
      }
      updatedWallets++;
    }

    // Update metrics directly from leaderboard data (more accurate than calculating from trades)
    await db.query(
      `INSERT INTO wallet_metrics 
       (wallet_id, pnl_1d, pnl_7d, pnl_30d, total_volume_7d, total_volume_30d, calculated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (wallet_id) DO UPDATE SET
         pnl_1d = EXCLUDED.pnl_1d,
         pnl_7d = EXCLUDED.pnl_7d,
         pnl_30d = EXCLUDED.pnl_30d,
         total_volume_7d = EXCLUDED.total_volume_7d,
         total_volume_30d = EXCLUDED.total_volume_30d,
         calculated_at = NOW(),
         updated_at = NOW()`,
      [
        walletId,
        dayPerf ? parseFloat(dayPerf.pnl) : 0,
        weekPerf ? parseFloat(weekPerf.pnl) : 0,
        monthPerf ? parseFloat(monthPerf.pnl) : 0,
        weekPerf ? parseFloat(weekPerf.vlm) : 0,
        monthPerf ? parseFloat(monthPerf.vlm) : 0,
      ]
    );

    // Save leaderboard snapshot
    for (const [period, perf] of entry.windowPerformances) {
      await db.query(
        `INSERT INTO leaderboard_snapshots 
         (platform_id, wallet_address, period, pnl, roi, snapshot_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          PLATFORM_ID,
          address,
          period,
          parseFloat(perf.pnl),
          parseFloat(perf.roi),
        ]
      );
    }
  }

  console.log(`📊 Leaderboard sync complete. New: ${newWallets}, Updated: ${updatedWallets}`);
  return newWallets;
}

/**
 * Sync trades for a wallet (for win rate calculation)
 */
export async function syncWalletTrades(walletId: number, address: string): Promise<number> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  console.log(`  📥 Fetching trades for ${address.slice(0, 10)}...`);
  
  try {
    const fills = await fetchUserFillsByTime(address, thirtyDaysAgo);
    let newTrades = 0;

    for (const fill of fills) {
      const txHash = fill.hash;
      
      // Skip invalid coins (e.g., @107, @142 - internal Hyperliquid indices, xyz:XYZ100 - special tokens)
      if (fill.coin.startsWith('@') || /^\d+$/.test(fill.coin) || fill.coin.includes(':')) {
        continue;
      }
      
      // Check if trade exists
      const existing = await db.query(
        'SELECT id FROM trades WHERE platform_id = $1 AND tx_hash = $2',
        [PLATFORM_ID, txHash]
      );

      if (existing.rows.length === 0) {
        const closedPnl = parseFloat(fill.closedPnl || '0');
        await db.query(
          `INSERT INTO trades 
           (wallet_id, platform_id, tx_hash, coin, side, size, price, closed_pnl, fee, is_win, traded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            walletId,
            PLATFORM_ID,
            txHash,
            fill.coin,
            fill.side === 'B' ? 'LONG' : 'SHORT',
            parseFloat(fill.sz),
            parseFloat(fill.px),
            closedPnl,
            parseFloat(fill.fee || '0'),
            closedPnl !== 0 ? closedPnl > 0 : null,
            new Date(fill.time),
          ]
        );
        newTrades++;
      }
    }

    console.log(`    ✅ ${newTrades} new trades`);
    return newTrades;
  } catch (error) {
    if (error instanceof Error && error.message.includes('400')) {
      console.log(`    ⚠️ No trades found`);
      return 0;
    }
    throw error;
  }
}

/**
 * Sync trades for all wallets (1000 wallets)
 * With 500ms delay between requests, full sync takes ~8-10 minutes
 */
export async function syncAllTrades(): Promise<void> {
  console.log('📈 Syncing trades for all wallets...');
  
  // Get all active wallets ordered by 30D PnL
  const wallets = await db.query<{ id: number; address: string }>(
    `SELECT w.id, w.address 
     FROM wallets w
     LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
     WHERE w.platform_id = $1 AND w.is_active = true
     ORDER BY COALESCE(m.pnl_30d, 0) DESC
     LIMIT 1000`,
    [PLATFORM_ID]
  );

  if (wallets.rows.length === 0) {
    console.log('  ⚠️ No wallets found. Run leaderboard sync first.');
    return;
  }

  console.log(`  Processing ${wallets.rows.length} wallets...`);
  console.log(`  Estimated time: ~${Math.ceil(wallets.rows.length * 2 / 60)} minutes`);
  
  let totalNewTrades = 0;
  let consecutiveErrors = 0;
  let processedCount = 0;
  const startTime = Date.now();

  for (const wallet of wallets.rows) {
    processedCount++;
    
    // Progress logging every 50 wallets
    if (processedCount % 50 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round((wallets.rows.length - processedCount) * 2);
      console.log(`  📊 Progress: ${processedCount}/${wallets.rows.length} (${Math.round(processedCount / wallets.rows.length * 100)}%) - ${totalNewTrades} new trades - ETA: ${remaining}s`);
    }
    
    try {
      const newTrades = await syncWalletTrades(wallet.id, wallet.address);
      totalNewTrades += newTrades;
      consecutiveErrors = 0; // Reset on success
      // Rate limiting: 2 seconds between requests to avoid 429 errors
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      consecutiveErrors++;
      console.error(`  ❌ Error for ${wallet.address}:`, error);
      
      // If we get too many consecutive errors (likely rate limited), wait longer
      if (consecutiveErrors >= 5) {
        console.log(`  ⏳ Rate limited, waiting 60 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        consecutiveErrors = 0;
      } else if (consecutiveErrors >= 3) {
        console.log(`  ⏳ Multiple errors, waiting 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else {
        // Wait extra time after an error
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`📊 Trade sync complete. Total new trades: ${totalNewTrades} in ${totalTime}s`);
}

/**
 * Calculate win rates from trade data
 */
export async function calculateAllMetrics(): Promise<void> {
  console.log('🧮 Calculating win rates from trade data...');
  
  const wallets = await db.query<{ id: number; address: string }>(
    'SELECT id, address FROM wallets WHERE platform_id = $1 AND is_active = true',
    [PLATFORM_ID]
  );

  if (wallets.rows.length === 0) {
    console.log('  ⚠️ No wallets found.');
    return;
  }

  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const wallet of wallets.rows) {
    try {
      // Calculate win rates and trade counts from trades table
      const result = await db.query<{
        win_rate_7d: number | null;
        win_rate_30d: number | null;
        trades_7d: number;
        trades_30d: number;
        last_trade_at: Date | null;
      }>(`
        SELECT 
          COUNT(CASE WHEN traded_at >= $2 AND is_win = true THEN 1 END)::float /
            NULLIF(COUNT(CASE WHEN traded_at >= $2 AND is_win IS NOT NULL THEN 1 END), 0) * 100 AS win_rate_7d,
          COUNT(CASE WHEN is_win = true THEN 1 END)::float /
            NULLIF(COUNT(CASE WHEN is_win IS NOT NULL THEN 1 END), 0) * 100 AS win_rate_30d,
          COUNT(CASE WHEN traded_at >= $2 THEN 1 END)::int AS trades_7d,
          COUNT(*)::int AS trades_30d,
          MAX(traded_at) AS last_trade_at
        FROM trades
        WHERE wallet_id = $1 AND traded_at >= $3
      `, [wallet.id, day7Ago, day30Ago]);

      const data = result.rows[0];

      // Update only win rate and trade count fields
      await db.query(`
        UPDATE wallet_metrics SET
          win_rate_7d = COALESCE($2, win_rate_7d, 0),
          win_rate_30d = COALESCE($3, win_rate_30d, 0),
          trades_count_7d = $4,
          trades_count_30d = $5,
          last_trade_at = COALESCE($6, last_trade_at),
          updated_at = NOW()
        WHERE wallet_id = $1
      `, [
        wallet.id,
        data?.win_rate_7d || 0,
        data?.win_rate_30d || 0,
        data?.trades_7d || 0,
        data?.trades_30d || 0,
        data?.last_trade_at,
      ]);

      console.log(`  ✅ ${wallet.address.slice(0, 10)}... WR: ${(data?.win_rate_30d || 0).toFixed(1)}%`);
    } catch (error) {
      console.error(`  ❌ Error for ${wallet.address}:`, error);
    }
  }

  console.log('📊 Metrics calculation complete.');
}

/**
 * Add a new wallet to track manually
 */
export async function addWallet(address: string, twitter?: string): Promise<boolean> {
  const normalizedAddress = address.toLowerCase();
  
  const existing = await db.query(
    'SELECT id FROM wallets WHERE address = $1 AND platform_id = $2',
    [normalizedAddress, PLATFORM_ID]
  );

  if (existing.rows.length > 0) {
    console.log(`Wallet ${address} already exists`);
    return false;
  }

  await db.query(
    `INSERT INTO wallets (address, platform_id, twitter_handle, is_active, discovered_at)
     VALUES ($1, $2, $3, true, NOW())`,
    [normalizedAddress, PLATFORM_ID, twitter]
  );

  console.log(`✅ Added wallet: ${address}`);
  return true;
}

/**
 * Update coins list from trades
 */
export async function updateCoinsList(): Promise<void> {
  console.log('🪙 Updating coins list...');
  
  // Get all unique coins from trades and their counts
  const result = await db.query<{ coin: string; count: number }>(`
    SELECT coin, COUNT(*) as count
    FROM trades
    GROUP BY coin
    ORDER BY count DESC
  `);

  for (const row of result.rows) {
    await db.query(`
      INSERT INTO coins (symbol, trade_count, last_seen_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (symbol) DO UPDATE SET
        trade_count = $2,
        last_seen_at = NOW()
    `, [row.coin, row.count]);
  }

  console.log(`📊 Updated ${result.rows.length} coins`);
}

/**
 * Calculate per-coin metrics for all wallets
 */
export async function calculateCoinMetrics(): Promise<void> {
  console.log('🪙 Calculating per-coin metrics...');
  
  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all wallets with trades
  const wallets = await db.query<{ id: number; address: string }>(`
    SELECT DISTINCT w.id, w.address
    FROM wallets w
    JOIN trades t ON w.id = t.wallet_id
    WHERE w.is_active = true
  `);

  console.log(`  Processing ${wallets.rows.length} wallets with trades...`);

  for (const wallet of wallets.rows) {
    // Get all coins this wallet has traded
    const coins = await db.query<{ coin: string }>(`
      SELECT DISTINCT coin FROM trades WHERE wallet_id = $1
    `, [wallet.id]);

    for (const coinRow of coins.rows) {
      const coin = coinRow.coin;

      // Calculate metrics for this wallet-coin pair
      const metrics = await db.query<{
        pnl_7d: number;
        pnl_30d: number;
        win_rate_7d: number | null;
        win_rate_30d: number | null;
        trades_7d: number;
        trades_30d: number;
        volume_30d: number;
        last_trade_at: Date | null;
      }>(`
        SELECT 
          COALESCE(SUM(CASE WHEN traded_at >= $2 THEN closed_pnl ELSE 0 END), 0)::float AS pnl_7d,
          COALESCE(SUM(closed_pnl), 0)::float AS pnl_30d,
          COUNT(CASE WHEN traded_at >= $2 AND is_win = true THEN 1 END)::float /
            NULLIF(COUNT(CASE WHEN traded_at >= $2 AND is_win IS NOT NULL THEN 1 END), 0) * 100 AS win_rate_7d,
          COUNT(CASE WHEN is_win = true THEN 1 END)::float /
            NULLIF(COUNT(CASE WHEN is_win IS NOT NULL THEN 1 END), 0) * 100 AS win_rate_30d,
          COUNT(CASE WHEN traded_at >= $2 THEN 1 END)::int AS trades_7d,
          COUNT(*)::int AS trades_30d,
          COALESCE(SUM(ABS(size * price)), 0)::float AS volume_30d,
          MAX(traded_at) AS last_trade_at
        FROM trades
        WHERE wallet_id = $1 AND coin = $4 AND traded_at >= $3
      `, [wallet.id, day7Ago, day30Ago, coin]);

      const data = metrics.rows[0];

      // Upsert wallet-coin metrics
      await db.query(`
        INSERT INTO wallet_coin_metrics 
        (wallet_id, coin, pnl_7d, pnl_30d, win_rate_7d, win_rate_30d, 
         trades_count_7d, trades_count_30d, total_volume_30d, last_trade_at, calculated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (wallet_id, coin) DO UPDATE SET
          pnl_7d = EXCLUDED.pnl_7d,
          pnl_30d = EXCLUDED.pnl_30d,
          win_rate_7d = EXCLUDED.win_rate_7d,
          win_rate_30d = EXCLUDED.win_rate_30d,
          trades_count_7d = EXCLUDED.trades_count_7d,
          trades_count_30d = EXCLUDED.trades_count_30d,
          total_volume_30d = EXCLUDED.total_volume_30d,
          last_trade_at = EXCLUDED.last_trade_at,
          calculated_at = NOW()
      `, [
        wallet.id,
        coin,
        data?.pnl_7d || 0,
        data?.pnl_30d || 0,
        data?.win_rate_7d || 0,
        data?.win_rate_30d || 0,
        data?.trades_7d || 0,
        data?.trades_30d || 0,
        data?.volume_30d || 0,
        data?.last_trade_at,
      ]);
    }

    console.log(`  ✅ ${wallet.address.slice(0, 10)}... (${coins.rows.length} coins)`);
  }

  // Update coins list
  await updateCoinsList();

  console.log('📊 Per-coin metrics calculation complete.');
}

/**
 * Take daily PnL snapshots for all active wallets
 * This stores the current 30D PnL as a daily snapshot for building accurate PnL curves
 */
export async function takeDailyPnlSnapshots(): Promise<void> {
  console.log('📸 Taking daily PnL snapshots...');
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Get all active wallets with their current metrics
  const wallets = await db.query<{
    id: number;
    address: string;
    pnl_1d: number;
    pnl_30d: number;
    trades_count_7d: number;
    win_rate_30d: number;
    total_volume_7d: number;
  }>(`
    SELECT 
      w.id,
      w.address,
      COALESCE(m.pnl_1d, 0)::float AS pnl_1d,
      COALESCE(m.pnl_30d, 0)::float AS pnl_30d,
      COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
      COALESCE(m.win_rate_30d, 0)::float AS win_rate_30d,
      COALESCE(m.total_volume_7d, 0)::float AS total_volume_7d
    FROM wallets w
    LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
    WHERE w.is_active = true
  `);

  console.log(`📊 Found ${wallets.rows.length} active wallets`);

  let inserted = 0;
  let updated = 0;

  for (const wallet of wallets.rows) {
    try {
      // Get yesterday's snapshot to calculate daily change
      const yesterday = await db.query<{ cumulative_pnl: number }>(`
        SELECT cumulative_pnl
        FROM daily_pnl_snapshots
        WHERE wallet_id = $1 AND snapshot_date < $2
        ORDER BY snapshot_date DESC
        LIMIT 1
      `, [wallet.id, today]);

      const yesterdayCumulativePnl = yesterday.rows[0]?.cumulative_pnl || 0;
      
      // Daily PnL is the difference between today's 30D cumulative and yesterday's snapshot
      // Note: This is an approximation. For more accurate daily PnL, we use pnl_1d when available
      const dailyPnl = wallet.pnl_1d || (wallet.pnl_30d - yesterdayCumulativePnl);

      // Upsert today's snapshot
      const result = await db.query<{ is_insert: boolean }>(`
        INSERT INTO daily_pnl_snapshots 
        (wallet_id, snapshot_date, pnl_1d, cumulative_pnl, trades_count, win_rate, volume)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (wallet_id, snapshot_date) DO UPDATE SET
          pnl_1d = EXCLUDED.pnl_1d,
          cumulative_pnl = EXCLUDED.cumulative_pnl,
          trades_count = EXCLUDED.trades_count,
          win_rate = EXCLUDED.win_rate,
          volume = EXCLUDED.volume
        RETURNING (xmax = 0) AS is_insert
      `, [
        wallet.id,
        today,
        dailyPnl,
        wallet.pnl_30d,  // Current 30D PnL as cumulative
        Math.round(wallet.trades_count_7d / 7),  // Approximate daily trades
        wallet.win_rate_30d,
        wallet.total_volume_7d / 7,  // Approximate daily volume
      ]);

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (error) {
      console.error(`  ❌ Error snapshotting ${wallet.address.slice(0, 10)}...:`, error);
    }
  }

  console.log(`📸 Daily snapshots complete: ${inserted} inserted, ${updated} updated`);
}

/**
 * Get PnL history for a wallet (for PnL curve)
 */
export async function getWalletPnlHistory(walletId: number, days = 30): Promise<{
  date: string;
  pnl: number;
  cumulativePnl: number;
}[]> {
  const result = await db.query<{
    snapshot_date: Date;
    pnl_1d: number;
    cumulative_pnl: number;
  }>(`
    SELECT snapshot_date, pnl_1d, cumulative_pnl
    FROM daily_pnl_snapshots
    WHERE wallet_id = $1
    ORDER BY snapshot_date DESC
    LIMIT $2
  `, [walletId, days]);

  return result.rows.reverse().map(row => ({
    date: row.snapshot_date.toISOString().split('T')[0],
    pnl: row.pnl_1d,
    cumulativePnl: row.cumulative_pnl,
  }));
}
