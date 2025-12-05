/**
 * Solana Dump Radar Worker
 * 
 * 监控 Solana 链上大额代币充值到 Binance
 * 使用 WebSocket 订阅模式（类似 EVM）
 */

import { 
  Connection, 
  PublicKey, 
  ParsedTransactionWithMeta,
  Logs,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import db from '../db/index.js';
import * as dumpRadarService from '../services/dumpRadarService.js';
import * as priceService from '../services/priceService.js';
import * as addressLabelService from '../services/addressLabelService.js';
import { broadcastDumpRadarEvent } from '../ws/index.js';

// Solana RPC 配置
const SOLANA_RPC_URL = process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com';
// WebSocket URL（从 HTTP URL 转换）
const SOLANA_WS_URL = process.env.SOL_WS_URL || SOLANA_RPC_URL
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

const NETWORK_ID = 'sol';
const NETWORK_NAME = 'Solana';
const EXPLORER_URL = 'https://solscan.io';

// Worker 状态
interface SolanaWorkerState {
  isRunning: boolean;
  connection: Connection | null;
  binanceAddresses: Set<string>;
  monitoredTokens: Map<string, { mint: string; symbol: string; decimals: number; tokenId: number }>;
  processedSignatures: Set<string>;
  subscriptionIds: number[];
  pendingSignatures: Set<string>; // 待处理的交易签名队列
}

const state: SolanaWorkerState = {
  isRunning: false,
  connection: null,
  binanceAddresses: new Set(),
  monitoredTokens: new Map(),
  processedSignatures: new Set(),
  subscriptionIds: [],
  pendingSignatures: new Set(),
};

// 限制已处理签名缓存大小
const MAX_PROCESSED_SIGNATURES = 10000;

// 初始化连接（支持 WebSocket）
function initConnection(): void {
  try {
    state.connection = new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: SOLANA_WS_URL,
    });
    console.log(`✅ Solana connection initialized`);
    console.log(`   HTTP: ${SOLANA_RPC_URL}`);
    console.log(`   WS: ${SOLANA_WS_URL}`);
  } catch (error) {
    console.error('❌ Failed to initialize Solana connection:', error);
    throw error;
  }
}

// 加载 Binance Solana 地址
async function loadBinanceAddresses(): Promise<void> {
  const result = await db.query<{ address: string }>(
    `SELECT address FROM binance_addresses WHERE network_id = $1`,
    [NETWORK_ID]
  );

  state.binanceAddresses.clear();
  for (const row of result.rows) {
    state.binanceAddresses.add(row.address);
  }

  console.log(`📋 Loaded ${state.binanceAddresses.size} Solana Binance addresses`);
}

// 加载监控的代币
async function loadMonitoredTokens(): Promise<void> {
  const result = await db.query<{
    id: number;
    symbol: string;
    contract_address: string;
    decimals: number;
  }>(
    `SELECT id, symbol, contract_address, decimals 
     FROM dump_radar_tokens 
     WHERE network_id = $1 AND is_enabled = true`,
    [NETWORK_ID]
  );

  state.monitoredTokens.clear();
  for (const row of result.rows) {
    state.monitoredTokens.set(row.contract_address, {
      mint: row.contract_address,
      symbol: row.symbol,
      decimals: row.decimals,
      tokenId: row.id,
    });
  }

  console.log(`🪙 Loaded ${state.monitoredTokens.size} Solana tokens to monitor`);
}

// 检查是否是 Binance 地址
function isBinanceAddress(address: string): boolean {
  return state.binanceAddresses.has(address);
}

// 解析 SPL Token 转账
interface TokenTransfer {
  mint: string;
  source: string;
  destination: string;
  amount: bigint;
  decimals: number;
}

function parseTokenTransfers(tx: ParsedTransactionWithMeta): TokenTransfer[] {
  const transfers: TokenTransfer[] = [];
  
  if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
    return transfers;
  }

  const preBalances = new Map<string, { amount: bigint; mint: string; owner: string; decimals: number }>();
  const postBalances = new Map<string, { amount: bigint; mint: string; owner: string; decimals: number }>();

  // 记录交易前余额
  for (const balance of tx.meta.preTokenBalances) {
    const key = `${balance.accountIndex}`;
    preBalances.set(key, {
      amount: BigInt(balance.uiTokenAmount.amount),
      mint: balance.mint,
      owner: balance.owner || '',
      decimals: balance.uiTokenAmount.decimals,
    });
  }

  // 记录交易后余额
  for (const balance of tx.meta.postTokenBalances) {
    const key = `${balance.accountIndex}`;
    postBalances.set(key, {
      amount: BigInt(balance.uiTokenAmount.amount),
      mint: balance.mint,
      owner: balance.owner || '',
      decimals: balance.uiTokenAmount.decimals,
    });
  }

  // 计算转账
  const ownerChanges = new Map<string, Map<string, bigint>>();

  for (const [key, post] of postBalances) {
    const pre = preBalances.get(key);
    const preAmount = pre?.amount || 0n;
    const change = post.amount - preAmount;
    
    if (change !== 0n && post.owner) {
      if (!ownerChanges.has(post.owner)) {
        ownerChanges.set(post.owner, new Map());
      }
      const mintChanges = ownerChanges.get(post.owner)!;
      const currentChange = mintChanges.get(post.mint) || 0n;
      mintChanges.set(post.mint, currentChange + change);
    }
  }

  // 检查减少的余额
  for (const [key, pre] of preBalances) {
    if (!postBalances.has(key) && pre.owner) {
      if (!ownerChanges.has(pre.owner)) {
        ownerChanges.set(pre.owner, new Map());
      }
      const mintChanges = ownerChanges.get(pre.owner)!;
      const currentChange = mintChanges.get(pre.mint) || 0n;
      mintChanges.set(pre.mint, currentChange - pre.amount);
    }
  }

  // 找出发送方和接收方
  for (const [owner, mintChanges] of ownerChanges) {
    for (const [mint, change] of mintChanges) {
      if (change > 0n) {
        for (const [otherOwner, otherMintChanges] of ownerChanges) {
          if (otherOwner !== owner) {
            const otherChange = otherMintChanges.get(mint);
            if (otherChange && otherChange < 0n && -otherChange === change) {
              const tokenInfo = state.monitoredTokens.get(mint);
              transfers.push({
                mint,
                source: otherOwner,
                destination: owner,
                amount: change,
                decimals: tokenInfo?.decimals || 9,
              });
            }
          }
        }
      }
    }
  }

  return transfers;
}

// 处理交易
async function processTransaction(signature: string): Promise<void> {
  if (state.processedSignatures.has(signature)) {
    return;
  }

  try {
    const tx = await state.connection!.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx || tx.meta?.err) {
      state.processedSignatures.add(signature);
      return;
    }

    const transfers = parseTokenTransfers(tx);
    
    for (const transfer of transfers) {
      // 检查是否是监控的代币
      const tokenInfo = state.monitoredTokens.get(transfer.mint);
      if (!tokenInfo) continue;

      // 检查目标是否是 Binance 地址
      if (!isBinanceAddress(transfer.destination)) continue;

      // 检查来源是否也是 Binance（内部转账）- 跳过
      if (isBinanceAddress(transfer.source)) {
        continue; // 跳过 Binance 内部转账，只监控外部充值
      }

      // 计算金额
      const amountFormatted = Number(transfer.amount) / Math.pow(10, transfer.decimals);
      
      // 获取价格
      const priceUsd = await priceService.getTokenPriceByContract(NETWORK_ID, transfer.mint);
      const amountUsd = priceUsd ? amountFormatted * priceUsd : null;

      // 检查是否达到最小阈值（默认 $1M）
      const minThreshold = parseFloat(process.env.DUMP_RADAR_MIN_USD || '1000000');
      if (!amountUsd || amountUsd < minThreshold) continue;

      console.log(`🔔 [Solana] Large deposit detected: ${tokenInfo.symbol} $${amountUsd.toFixed(2)} to Binance`);

      // 获取交易时间
      const txTimestamp = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();

      // 获取 Binance 地址标签
      const binanceResult = await dumpRadarService.isBinanceAddress(NETWORK_ID, transfer.destination);
      const binanceLabel = binanceResult.label || 'Binance';

      // 获取发送方标签
      const fromLabel = await addressLabelService.getAddressLabel(NETWORK_ID, transfer.source, { checkWhale: true });

      // 记录事件
      const event = await dumpRadarService.recordEvent({
        tokenId: tokenInfo.tokenId,
        networkId: NETWORK_ID,
        txHash: signature,
        blockNumber: tx.slot,
        fromAddress: transfer.source,
        toAddress: transfer.destination,
        toBinanceLabel: binanceLabel,
        amount: transfer.amount.toString(),
        amountFormatted,
        amountUsd,
        priceAtTime: priceUsd || 0,
        fromLabel: fromLabel.label || undefined,
        fromTag: fromLabel.tag,
        txTimestamp,
      });

      if (event) {
        // 广播 WebSocket 事件
        broadcastDumpRadarEvent({
          ...event,
          token_symbol: tokenInfo.symbol,
          network_name: NETWORK_NAME,
          explorer_url: EXPLORER_URL,
        });

        // 发送 Telegram 通知
        const token = await dumpRadarService.getToken(tokenInfo.tokenId);
        if (token) {
          await dumpRadarService.sendDumpRadarNotification(
            event,
            token,
            NETWORK_NAME,
            EXPLORER_URL
          );
        }
      }
    }

    // 添加到已处理
    state.processedSignatures.add(signature);
    
    // 限制缓存大小
    if (state.processedSignatures.size > MAX_PROCESSED_SIGNATURES) {
      const toDelete = Array.from(state.processedSignatures).slice(0, 1000);
      toDelete.forEach(s => state.processedSignatures.delete(s));
    }
  } catch (error: any) {
    // 只在非 429 错误时打印
    if (!error?.message?.includes('429')) {
      console.error(`Error processing Solana transaction ${signature}:`, error?.message || error);
    }
  }
}

// 处理日志事件（来自 WebSocket 订阅）
function handleLogs(logs: Logs, context: { slot: number }): void {
  if (!state.isRunning) return;
  
  // 检查是否有错误
  if (logs.err) return;
  
  const signature = logs.signature;
  
  // 跳过已处理的
  if (state.processedSignatures.has(signature)) return;
  
  // 添加到待处理队列
  state.pendingSignatures.add(signature);
}

// 批量处理待处理的交易（避免阻塞订阅）
async function processPendingSignatures(): Promise<void> {
  while (state.isRunning) {
    const signatures = Array.from(state.pendingSignatures);
    state.pendingSignatures.clear();
    
    if (signatures.length > 0) {
      console.log(`📥 Processing ${signatures.length} new transactions...`);
      
      for (const signature of signatures) {
        if (!state.isRunning) break;
        await processTransaction(signature);
        // 每个交易之间稍微等待，避免 rate limit
        await sleep(100);
      }
    }
    
    // 每秒检查一次
    await sleep(1000);
  }
}

// 订阅 Binance 地址的 Token 转账
async function subscribeToAddresses(): Promise<void> {
  if (!state.connection) return;

  const addresses = Array.from(state.binanceAddresses);
  console.log(`👂 Subscribing to ${addresses.length} Binance addresses...`);

  for (const address of addresses) {
    try {
      const pubkey = new PublicKey(address);
      
      // 订阅该地址的日志
      const subscriptionId = state.connection.onLogs(
        pubkey,
        (logs, context) => handleLogs(logs, context),
        'confirmed'
      );
      
      state.subscriptionIds.push(subscriptionId);
      console.log(`  ✅ Subscribed to ${address.slice(0, 8)}...`);
    } catch (error) {
      console.error(`  ❌ Failed to subscribe to ${address}:`, error);
    }
  }

  console.log(`📡 Active subscriptions: ${state.subscriptionIds.length}`);
}

// 取消所有订阅
async function unsubscribeAll(): Promise<void> {
  if (!state.connection) return;

  console.log(`🔌 Unsubscribing from ${state.subscriptionIds.length} subscriptions...`);
  
  for (const id of state.subscriptionIds) {
    try {
      await state.connection.removeOnLogsListener(id);
    } catch (error) {
      // 忽略取消订阅错误
    }
  }
  
  state.subscriptionIds = [];
}

// 定期重新加载配置
async function startConfigReloader(): Promise<void> {
  setInterval(async () => {
    if (!state.isRunning) return;
    
    try {
      const oldAddressCount = state.binanceAddresses.size;
      const oldTokenCount = state.monitoredTokens.size;
      
      await loadBinanceAddresses();
      await loadMonitoredTokens();
      
      // 如果地址变化，重新订阅
      if (state.binanceAddresses.size !== oldAddressCount) {
        console.log('📋 Binance addresses changed, resubscribing...');
        await unsubscribeAll();
        await subscribeToAddresses();
      }
    } catch (error) {
      console.error('Error reloading config:', error);
    }
  }, 10 * 60 * 1000); // 每 10 分钟
}

// 定期更新价格
async function startPriceUpdater(): Promise<void> {
  const updatePrices = async () => {
    if (!state.isRunning) return;
    
    try {
      const updated = await priceService.updateTokenPricesInDb();
      console.log(`💰 Updated ${updated} token prices`);
    } catch (error) {
      console.error('Error updating prices:', error);
    }
  };

  await updatePrices();
  setInterval(updatePrices, 5 * 60 * 1000); // 每 5 分钟
}

// 启动 Worker
export async function startSolanaDumpRadarWorker(): Promise<void> {
  if (state.isRunning) {
    console.log('⚠️ Solana Dump Radar Worker is already running');
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════╗
║     🔔 Solana Dump Radar Worker Starting         ║
║        (WebSocket Subscription Mode)              ║
╚═══════════════════════════════════════════════════╝
  `);

  try {
    initConnection();
    await loadBinanceAddresses();
    await loadMonitoredTokens();

    state.isRunning = true;

    // 启动价格更新
    await startPriceUpdater();

    // 启动配置重新加载
    await startConfigReloader();

    // 订阅 Binance 地址
    await subscribeToAddresses();

    // 启动后台处理
    processPendingSignatures();

    console.log('✅ Solana Dump Radar Worker started successfully');
    console.log('   Mode: WebSocket subscription (low bandwidth)');
  } catch (error) {
    console.error('❌ Failed to start Solana Dump Radar Worker:', error);
    state.isRunning = false;
    throw error;
  }
}

// 停止 Worker
export async function stopSolanaDumpRadarWorker(): Promise<void> {
  console.log('🛑 Stopping Solana Dump Radar Worker...');
  
  state.isRunning = false;
  
  await unsubscribeAll();
  
  state.connection = null;
  state.pendingSignatures.clear();
  
  console.log('✅ Solana Dump Radar Worker stopped');
}

// 单次扫描（仍使用轮询模式）
export async function scanOnce(options: {
  limit?: number;
} = {}): Promise<void> {
  const { limit = 50 } = options;

  console.log('🔍 Running one-time Solana scan...');

  initConnection();
  await loadBinanceAddresses();
  await loadMonitoredTokens();

  state.isRunning = true;

  const addresses = Array.from(state.binanceAddresses);
  console.log(`🔍 Scanning ${addresses.length} addresses (limit: ${limit} each)...`);

  for (const addr of addresses) {
    if (!state.isRunning) break;

    try {
      const pubkey = new PublicKey(addr);
      const signatures = await state.connection!.getSignaturesForAddress(pubkey, {
        limit: limit,
      });

      console.log(`  📋 ${addr.slice(0, 8)}... : ${signatures.length} transactions`);

      for (const sigInfo of signatures) {
        if (!state.isRunning) break;
        await processTransaction(sigInfo.signature);
        await sleep(200);
      }
    } catch (error: any) {
      if (!error?.message?.includes('429')) {
        console.error(`  ❌ Error scanning ${addr}:`, error?.message || error);
      }
    }
    
    await sleep(1000);
  }

  state.isRunning = false;
  state.connection = null;

  console.log('✅ One-time Solana scan completed');
}

// 导出状态
export function getSolanaWorkerStatus(): {
  isRunning: boolean;
  binanceAddresses: number;
  monitoredTokens: number;
  processedSignatures: number;
  activeSubscriptions: number;
  pendingSignatures: number;
} {
  return {
    isRunning: state.isRunning,
    binanceAddresses: state.binanceAddresses.size,
    monitoredTokens: state.monitoredTokens.size,
    processedSignatures: state.processedSignatures.size,
    activeSubscriptions: state.subscriptionIds.length,
    pendingSignatures: state.pendingSignatures.size,
  };
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
