/**
 * Dump Radar Worker Runner
 * 
 * 使用:
 *   npm run worker:dump-radar              # 运行 EVM 链监控
 *   npm run worker:dump-radar:solana       # 运行 Solana 链监控
 *   npm run worker:dump-radar:all          # 同时运行所有链
 *   npm run worker:dump-radar:once         # 单次扫描 EVM
 *   npm run worker:dump-radar:solana:once  # 单次扫描 Solana
 */

import 'dotenv/config';
import { startDumpRadarWorker, stopDumpRadarWorker, scanOnce as evmScanOnce, getWorkerStatus as getEvmStatus } from './dumpRadar.js';
import { 
  startSolanaDumpRadarWorker, 
  stopSolanaDumpRadarWorker, 
  scanOnce as solanaScanOnce, 
  getSolanaWorkerStatus 
} from './dumpRadarSolana.js';

const args = process.argv.slice(2);
const isOnce = args.includes('--once');
const isSolana = args.includes('--solana');
const isAll = args.includes('--all');
const networkId = args.find(a => a.startsWith('--network='))?.split('=')[1];
const blocks = parseInt(args.find(a => a.startsWith('--blocks='))?.split('=')[1] || '100', 10);
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50', 10);

function printBanner(mode: string, chain: string) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║               🔔 Binance Dump Radar Worker                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Monitor large token deposits to Binance                     ║
║                                                               ║
║  Chain: ${chain.padEnd(54)}║
║  Mode: ${mode.padEnd(55)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

async function runEvm() {
  if (isOnce) {
    printBanner('One-time scan', `EVM${networkId ? ` (${networkId})` : ' (all networks)'}`);
    await evmScanOnce({ networkId, blocks });
  } else {
    printBanner('Continuous monitoring', 'EVM (ETH, BSC, ARB, BASE)');
    await startDumpRadarWorker();
  }
}

async function runSolana() {
  if (isOnce) {
    printBanner('One-time scan', 'Solana');
    await solanaScanOnce({ limit });
  } else {
    printBanner('Continuous monitoring', 'Solana');
    await startSolanaDumpRadarWorker();
  }
}

async function main() {
  if (isAll) {
    // 同时运行所有链
    printBanner('Continuous monitoring', 'ALL (EVM + Solana)');
    await Promise.all([
      startDumpRadarWorker(),
      startSolanaDumpRadarWorker(),
    ]);
  } else if (isSolana) {
    // 只运行 Solana
    await runSolana();
  } else {
    // 默认运行 EVM
    await runEvm();
  }

  if (!isOnce) {
    // 优雅关闭
    const shutdown = async () => {
      console.log('\n🛑 Received shutdown signal...');
      if (isAll || !isSolana) {
        await stopDumpRadarWorker();
      }
      if (isAll || isSolana) {
        stopSolanaDumpRadarWorker();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 定期打印状态
    setInterval(() => {
      if (isAll || !isSolana) {
        const evmStatus = getEvmStatus();
        console.log(`📊 [EVM] Status: ${evmStatus.networks.length} networks, ${evmStatus.monitoredTokens} tokens, ${evmStatus.binanceAddresses} addresses`);
      }
      if (isAll || isSolana) {
        const solStatus = getSolanaWorkerStatus();
        console.log(`📊 [SOL] Status: ${solStatus.monitoredTokens} tokens, ${solStatus.binanceAddresses} addresses, ${solStatus.processedSignatures} processed`);
      }
    }, 60000);
  } else {
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ Worker failed:', error);
  process.exit(1);
});

