/**
 * Solana Dump Radar Worker
 * 
 * 监控 Solana 链上大额代币充值到 Binance
 * 使用 @solana/web3.js 监听 SPL Token 转账
 */

import { 
  Connection, 
  PublicKey, 
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import db from '../db/index.js';
import * as dumpRadarService from '../services/dumpRadarService.js';
import * as priceService from '../services/priceService.js';
import * as addressLabelService from '../services/addressLabelService.js';
import { broadcastDumpRadarEvent } from '../ws/index.js';

// Solana RPC 配置
const SOLANA_RPC_URL = process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com';
const NETWORK_ID = 'sol';
const NETWORK_NAME = 'Solana';
const EXPLORER_URL = 'https://solscan.io';

// Worker 状态
interface SolanaWorkerState {
  isRunning: boolean;
  connection: Connection | null;
  binanceAddresses: Set<string>;
  monitoredTokens: Map<string, { mint: string; symbol: string; decimals: number; tokenId: number }>;
  lastProcessedSignature: string | null;
  processedSignatures: Set<string>;
}

const state: SolanaWorkerState = {
  isRunning: false,
  connection: null,
  binanceAddresses: new Set(),
  monitoredTokens: new Map(),
  lastProcessedSignature: null,
  processedSignatures: new Set(),
};

// 初始化连接
function initConnection(): void {
  try {
    state.connection = new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
    console.log(`✅ Solana connection initialized: ${SOLANA_RPC_URL}`);
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
  const ownerChanges = new Map<string, Map<string, bigint>>(); // owner -> mint -> change

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

  // 检查减少的余额（未在 post 中出现的）
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
        // 这是接收方，找对应的发送方
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

// 带重试的请求
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.message?.includes('Too Many Requests');
      if (isRateLimit && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`  ⏳ Rate limited, waiting ${delay}ms...`);
        await sleep(delay);
      } else if (i === maxRetries - 1) {
        throw error;
      }
    }
  }
  return null;
}

// 处理交易
async function processTransaction(signature: string): Promise<void> {
  if (state.processedSignatures.has(signature)) {
    return;
  }

  try {
    const tx = await fetchWithRetry(() => 
      state.connection!.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      })
    );
    
    if (!tx) {
      state.processedSignatures.add(signature);
      return;
    }

    if (tx.meta?.err) {
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

      // 检查来源是否也是 Binance（内部转账）
      const isInternalTransfer = isBinanceAddress(transfer.source);

      // 计算金额
      const amountFormatted = Number(transfer.amount) / Math.pow(10, transfer.decimals);
      
      // 获取价格
      const priceUsd = await priceService.getTokenPriceByContract(NETWORK_ID, transfer.mint);
      const amountUsd = priceUsd ? amountFormatted * priceUsd : null;

      // 检查是否达到最小阈值
      const minThreshold = parseFloat(process.env.DUMP_RADAR_MIN_USD || '100000');
      if (!amountUsd || amountUsd < minThreshold) continue;

      console.log(`🔔 [Solana] Large deposit detected: ${tokenInfo.symbol} $${amountUsd.toFixed(2)} to Binance`);

      // 获取交易时间
      const txTimestamp = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();

      // 获取 Binance 地址标签
      const binanceResult = await dumpRadarService.isBinanceAddress(NETWORK_ID, transfer.destination);
      const binanceLabel = binanceResult.label || 'Binance';

      // 获取发送方标签
      const fromLabel = isInternalTransfer
        ? { label: 'Binance Internal', tag: 'exchange' as const, source: 'internal' }
        : await addressLabelService.getAddressLabel(NETWORK_ID, transfer.source, { checkWhale: true });

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

    state.processedSignatures.add(signature);
  } catch (error) {
    console.error(`Error processing Solana transaction ${signature}:`, error);
  }
}

// 监控 Binance 地址的交易
async function pollBinanceAddresses(): Promise<void> {
  if (!state.isRunning || !state.connection) return;

  const addresses = Array.from(state.binanceAddresses);
  if (addresses.length === 0) {
    console.log('⚠️ No Solana Binance addresses to monitor');
    return;
  }

  console.log(`🔍 Polling ${addresses.length} Solana Binance addresses...`);

  for (const address of addresses) {
    if (!state.isRunning) break;

    try {
      const pubkey = new PublicKey(address);
      
      // 获取最近的交易签名
      const signatures = await state.connection.getSignaturesForAddress(pubkey, {
        limit: 20,
      });

      for (const sigInfo of signatures) {
        if (!state.isRunning) break;
        await processTransaction(sigInfo.signature);
        // 每个交易处理后等待
        await sleep(500);
      }

      // 每个地址处理后等待更长时间
      await sleep(2000);
    } catch (error) {
      console.error(`Error polling Solana address ${address}:`, error);
    }
  }
}

// 扫描历史交易
async function scanHistoricalTransactions(options: {
  address?: string;
  limit?: number;
} = {}): Promise<void> {
  const { address, limit = 100 } = options;
  
  const addresses = address ? [address] : Array.from(state.binanceAddresses);
  
  console.log(`🔍 Scanning historical Solana transactions for ${addresses.length} addresses (limit: ${limit})...`);

  for (const addr of addresses) {
    if (!state.isRunning) break;

    try {
      const pubkey = new PublicKey(addr);
      let lastSignature: string | undefined;
      let processed = 0;

      while (processed < limit && state.isRunning) {
        const signatures = await state.connection!.getSignaturesForAddress(pubkey, {
          limit: Math.min(50, limit - processed),
          before: lastSignature,
        });

        if (signatures.length === 0) break;

        for (const sigInfo of signatures) {
          if (!state.isRunning) break;
          await processTransaction(sigInfo.signature);
          processed++;
          // 每个交易处理后等待
          await sleep(500);
        }

        lastSignature = signatures[signatures.length - 1].signature;
        
        // 每批次处理后等待更长时间
        await sleep(3000);
      }
    } catch (error) {
      console.error(`Error scanning Solana address ${addr}:`, error);
    }
  }

  console.log('✅ Historical scan completed');
}

// 定期轮询
async function startPolling(): Promise<void> {
  const pollInterval = parseInt(process.env.SOL_POLL_INTERVAL || '30000', 10); // 默认 30 秒

  const poll = async () => {
    if (!state.isRunning) return;
    
    try {
      await pollBinanceAddresses();
    } catch (error) {
      console.error('Error in Solana polling:', error);
    }

    if (state.isRunning) {
      setTimeout(poll, pollInterval);
    }
  };

  await poll();
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
╚═══════════════════════════════════════════════════╝
  `);

  try {
    initConnection();
    await loadBinanceAddresses();
    await loadMonitoredTokens();

    state.isRunning = true;

    // 启动轮询
    await startPolling();

    console.log('✅ Solana Dump Radar Worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start Solana Dump Radar Worker:', error);
    state.isRunning = false;
    throw error;
  }
}

// 停止 Worker
export function stopSolanaDumpRadarWorker(): void {
  console.log('🛑 Stopping Solana Dump Radar Worker...');
  state.isRunning = false;
  state.connection = null;
  console.log('✅ Solana Dump Radar Worker stopped');
}

// 单次扫描
export async function scanOnce(options: {
  limit?: number;
} = {}): Promise<void> {
  const { limit = 50 } = options;

  console.log('🔍 Running one-time Solana scan...');

  initConnection();
  await loadBinanceAddresses();
  await loadMonitoredTokens();

  state.isRunning = true;

  await scanHistoricalTransactions({ limit });

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
} {
  return {
    isRunning: state.isRunning,
    binanceAddresses: state.binanceAddresses.size,
    monitoredTokens: state.monitoredTokens.size,
    processedSignatures: state.processedSignatures.size,
  };
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

