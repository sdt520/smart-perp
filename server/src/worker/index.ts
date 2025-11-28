import 'dotenv/config';
import cron from 'node-cron';
import db from '../db/index.js';
import * as hyperliquid from './hyperliquid.js';

const isOnce = process.argv.includes('--once');

async function createSyncJob(jobType: string, platformId?: string): Promise<number> {
  const result = await db.query<{ id: number }>(
    `INSERT INTO sync_jobs (job_type, platform_id, status, started_at)
     VALUES ($1, $2, 'running', NOW())
     RETURNING id`,
    [jobType, platformId]
  );
  return result.rows[0].id;
}

async function completeSyncJob(jobId: number, error?: Error): Promise<void> {
  await db.query(
    `UPDATE sync_jobs SET
       status = $2,
       completed_at = NOW(),
       error_message = $3
     WHERE id = $1`,
    [jobId, error ? 'failed' : 'completed', error?.message]
  );
}

// Job: Sync Leaderboard
async function runLeaderboardSync(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('🏆 Starting Leaderboard Sync Job');
  console.log('='.repeat(50));
  
  const jobId = await createSyncJob('leaderboard_sync', 'hyperliquid');
  
  try {
    await hyperliquid.syncLeaderboard();
    await completeSyncJob(jobId);
    console.log('✅ Leaderboard sync completed successfully\n');
  } catch (error) {
    await completeSyncJob(jobId, error as Error);
    console.error('❌ Leaderboard sync failed:', error);
  }
}

// Job: Sync Trades
async function runTradesSync(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('📈 Starting Trades Sync Job');
  console.log('='.repeat(50));
  
  const jobId = await createSyncJob('trades_sync', 'hyperliquid');
  
  try {
    await hyperliquid.syncAllTrades();
    await completeSyncJob(jobId);
    console.log('✅ Trades sync completed successfully\n');
  } catch (error) {
    await completeSyncJob(jobId, error as Error);
    console.error('❌ Trades sync failed:', error);
  }
}

// Job: Calculate Metrics
async function runMetricsCalculation(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('🧮 Starting Metrics Calculation Job');
  console.log('='.repeat(50));
  
  const jobId = await createSyncJob('metrics_calc', 'hyperliquid');
  
  try {
    await hyperliquid.calculateAllMetrics();
    await completeSyncJob(jobId);
    console.log('✅ Metrics calculation completed successfully\n');
  } catch (error) {
    await completeSyncJob(jobId, error as Error);
    console.error('❌ Metrics calculation failed:', error);
  }
}

// Job: Calculate Per-Coin Metrics
async function runCoinMetricsCalculation(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('🪙 Starting Per-Coin Metrics Calculation Job');
  console.log('='.repeat(50));
  
  const jobId = await createSyncJob('coin_metrics_calc', 'hyperliquid');
  
  try {
    await hyperliquid.calculateCoinMetrics();
    await completeSyncJob(jobId);
    console.log('✅ Per-coin metrics calculation completed successfully\n');
  } catch (error) {
    await completeSyncJob(jobId, error as Error);
    console.error('❌ Per-coin metrics calculation failed:', error);
  }
}

// Job: Take Daily PnL Snapshots
async function runDailyPnlSnapshots(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('📸 Starting Daily PnL Snapshots Job');
  console.log('='.repeat(50));
  
  const jobId = await createSyncJob('daily_pnl_snapshot', 'hyperliquid');
  
  try {
    await hyperliquid.takeDailyPnlSnapshots();
    await completeSyncJob(jobId);
    console.log('✅ Daily PnL snapshots completed successfully\n');
  } catch (error) {
    await completeSyncJob(jobId, error as Error);
    console.error('❌ Daily PnL snapshots failed:', error);
  }
}

// Run all jobs once (for testing or manual trigger)
async function runAllOnce(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════╗
║        Smart Perp Worker - Single Run Mode         ║
╚════════════════════════════════════════════════════╝
  `);

  await runLeaderboardSync();
  await runTradesSync();
  await runMetricsCalculation();
  await runCoinMetricsCalculation();
  await runDailyPnlSnapshots();

  console.log('\n✅ All jobs completed. Exiting...');
  process.exit(0);
}

// Combined job: Sync trades, calculate metrics, then take snapshots
async function runTradesSyncWithMetricsAndSnapshots(): Promise<void> {
  await runTradesSync();
  await runMetricsCalculation();
  await runCoinMetricsCalculation();
  await runDailyPnlSnapshots();
}

// Start scheduled worker
function startScheduledWorker(): void {
  console.log(`
╔════════════════════════════════════════════════════╗
║          Smart Perp Worker - Scheduled Mode        ║
╠════════════════════════════════════════════════════╣
║  Leaderboard Sync:  Every 12 hours                 ║
║  Trades Sync:       Every 12 hours                 ║
║    → Metrics Calc:  After trades sync              ║
║    → Coin Metrics:  After metrics calc             ║
║    → PnL Snapshots: After coin metrics             ║
╚════════════════════════════════════════════════════╝
  `);

  // Leaderboard sync - every 12 hours (at 00:00 and 12:00)
  // Updates wallet list and PnL data from Hyperliquid ranking
  cron.schedule(process.env.WORKER_LEADERBOARD_CRON || '0 0,12 * * *', () => {
    runLeaderboardSync();
  });

  // Trades sync + metrics calculation + daily snapshots - every 12 hours (at 00:30 and 12:30)
  // Fetches trade details, then calculates win rates, per-coin metrics, and takes PnL snapshots
  // Offset by 30 minutes to avoid running simultaneously with leaderboard sync
  cron.schedule(process.env.WORKER_TRADES_CRON || '30 0,12 * * *', () => {
    runTradesSyncWithMetricsAndSnapshots();
  });

  // Run initial sync on startup
  console.log('🚀 Running initial sync...\n');
  runLeaderboardSync()
    .then(() => runTradesSyncWithMetricsAndSnapshots())
    .then(() => console.log('\n✅ Initial sync complete. Worker is now running on schedule.'));
}

// Main
if (isOnce) {
  runAllOnce();
} else {
  startScheduledWorker();
}

