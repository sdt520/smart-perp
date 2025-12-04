/**
 * Dump Radar Worker Runner
 * 
 * 使用: npm run worker:dump-radar
 * 或: npm run worker:dump-radar:once (单次扫描)
 */

import 'dotenv/config';
import { startDumpRadarWorker, stopDumpRadarWorker, scanOnce, getWorkerStatus } from './dumpRadar.js';

const args = process.argv.slice(2);
const isOnce = args.includes('--once');
const networkId = args.find(a => a.startsWith('--network='))?.split('=')[1];
const blocks = parseInt(args.find(a => a.startsWith('--blocks='))?.split('=')[1] || '100', 10);

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║               🔔 Binance Dump Radar Worker                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Monitor large token deposits to Binance                     ║
║                                                               ║
║  Mode: ${isOnce ? 'One-time scan' : 'Continuous monitoring'}                                  ║
${networkId ? `║  Network: ${networkId.padEnd(50)}║\n` : ''}${isOnce ? `║  Blocks to scan: ${blocks.toString().padEnd(44)}║\n` : ''}╚═══════════════════════════════════════════════════════════════╝
  `);

  if (isOnce) {
    // 单次扫描模式
    await scanOnce({ networkId, blocks });
    process.exit(0);
  } else {
    // 持续监控模式
    await startDumpRadarWorker();

    // 优雅关闭
    const shutdown = async () => {
      console.log('\n🛑 Received shutdown signal...');
      await stopDumpRadarWorker();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 定期打印状态
    setInterval(() => {
      const status = getWorkerStatus();
      console.log(`📊 Status: ${status.networks.length} networks, ${status.monitoredTokens} tokens, ${status.binanceAddresses} Binance addresses`);
    }, 60000);
  }
}

main().catch((error) => {
  console.error('❌ Worker failed:', error);
  process.exit(1);
});

