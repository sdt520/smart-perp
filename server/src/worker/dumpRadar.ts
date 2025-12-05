/**
 * Dump Radar Worker
 * 
 * 监控大额代币充值到 Binance
 * 使用 Alchemy/Infura RPC 节点监听 Transfer 事件
 */

import { ethers } from 'ethers';
import db from '../db/index.js';
import * as dumpRadarService from '../services/dumpRadarService.js';
import * as priceService from '../services/priceService.js';
import * as addressLabelService from '../services/addressLabelService.js';
import * as binanceDetector from '../services/binanceAddressDetector.js';
import { broadcastDumpRadarEvent } from '../ws/index.js';

// ERC20 Transfer 事件签名
const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');

// ERC20 ABI (只需要 Transfer 事件和 decimals)
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// 网络 RPC 配置
interface NetworkConfig {
  id: string;
  name: string;
  rpcUrl: string;
  chainId: number;
  blockTime: number; // 平均出块时间（秒）
}

// 默认 RPC（公共节点，生产环境建议使用 Alchemy/Infura）
const NETWORK_CONFIGS: NetworkConfig[] = [
  {
    id: 'eth',
    name: 'Ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
    chainId: 1,
    blockTime: 12,
  },
  {
    id: 'bsc',
    name: 'BNB Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-rpc.publicnode.com',
    chainId: 56,
    blockTime: 3,
  },
  {
    id: 'arb',
    name: 'Arbitrum',
    rpcUrl: process.env.ARB_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
    chainId: 42161,
    blockTime: 0.25,
  },
  {
    id: 'base',
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
    chainId: 8453,
    blockTime: 2,
  },
];

// Worker 状态
interface WorkerState {
  isRunning: boolean;
  providers: Map<string, ethers.JsonRpcProvider>;
  lastProcessedBlock: Map<string, number>;
  monitoredTokens: Map<string, Set<string>>; // networkId -> Set<contractAddress>
  binanceAddresses: Map<string, Set<string>>; // networkId -> Set<address>
}

const state: WorkerState = {
  isRunning: false,
  providers: new Map(),
  lastProcessedBlock: new Map(),
  monitoredTokens: new Map(),
  binanceAddresses: new Map(),
};

// 初始化 Provider
function initProviders(): void {
  for (const config of NETWORK_CONFIGS) {
    try {
      // 使用 staticNetwork 跳过网络检测，避免 RPC 连接问题
      const network = new ethers.Network(config.name, config.chainId);
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, network, {
        staticNetwork: network,
      });
      state.providers.set(config.id, provider);
      console.log(`✅ Provider initialized for ${config.name}`);
    } catch (error) {
      console.error(`❌ Failed to initialize provider for ${config.name}:`, error);
    }
  }
}

// 加载 Binance 地址
async function loadBinanceAddresses(): Promise<void> {
  const result = await db.query<{ network_id: string; address: string }>(
    'SELECT network_id, LOWER(address) as address FROM binance_addresses'
  );

  state.binanceAddresses.clear();
  for (const row of result.rows) {
    if (!state.binanceAddresses.has(row.network_id)) {
      state.binanceAddresses.set(row.network_id, new Set());
    }
    state.binanceAddresses.get(row.network_id)!.add(row.address);
  }

  console.log(`📋 Loaded Binance addresses:`, 
    Array.from(state.binanceAddresses.entries())
      .map(([k, v]) => `${k}: ${v.size}`)
      .join(', ')
  );
}

// 加载监控的代币
async function loadMonitoredTokens(): Promise<void> {
  const result = await db.query<{ network_id: string; contract_address: string }>(
    `SELECT DISTINCT t.network_id, LOWER(t.contract_address) as contract_address
     FROM dump_radar_tokens t
     WHERE t.is_enabled = true`
  );

  state.monitoredTokens.clear();
  for (const row of result.rows) {
    if (!state.monitoredTokens.has(row.network_id)) {
      state.monitoredTokens.set(row.network_id, new Set());
    }
    state.monitoredTokens.get(row.network_id)!.add(row.contract_address);
  }

  console.log(`🪙 Loaded monitored tokens:`,
    Array.from(state.monitoredTokens.entries())
      .map(([k, v]) => `${k}: ${v.size}`)
      .join(', ')
  );
}

// 检查是否是 Binance 地址（只查本地缓存，不调用 API）
function checkBinanceAddressLocal(networkId: string, address: string): {
  isBinance: boolean;
  label: string | null;
} {
  const addresses = state.binanceAddresses.get(networkId);
  if (addresses?.has(address.toLowerCase())) {
    // 同步返回，标签稍后异步获取
    return { isBinance: true, label: null };
  }
  return { isBinance: false, label: null };
}

// 检查是否是 Binance 地址（包括 API 检测，用于大额交易）
async function checkBinanceAddress(networkId: string, address: string, useApi: boolean = false): Promise<{
  isBinance: boolean;
  label: string | null;
}> {
  // 1. 先查本地缓存（快速路径）
  const addresses = state.binanceAddresses.get(networkId);
  if (addresses?.has(address.toLowerCase())) {
    const label = await getBinanceLabel(networkId, address);
    return { isBinance: true, label };
  }

  // 2. 如果不需要调用 API，直接返回
  if (!useApi) {
    return { isBinance: false, label: null };
  }

  // 3. 动态检测（查 Moralis/Arkham 等第三方 API）
  const detection = await binanceDetector.detectBinanceAddress(networkId, address);
  
  if (detection.isBinance) {
    // 添加到本地缓存
    if (!state.binanceAddresses.has(networkId)) {
      state.binanceAddresses.set(networkId, new Set());
    }
    state.binanceAddresses.get(networkId)!.add(address.toLowerCase());
    
    return { isBinance: true, label: detection.label };
  }

  return { isBinance: false, label: null };
}

// 获取代币信息
async function getTokenInfo(networkId: string, contractAddress: string): Promise<{
  id: number;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
} | null> {
  const result = await db.query<{
    id: number;
    symbol: string;
    decimals: number;
    price_usd: string | null;
    coingecko_id: string | null;
  }>(
    `SELECT id, symbol, decimals, price_usd, coingecko_id 
     FROM dump_radar_tokens 
     WHERE network_id = $1 AND LOWER(contract_address) = LOWER($2)`,
    [networkId, contractAddress]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  let priceUsd = row.price_usd ? parseFloat(row.price_usd) : null;

  // 如果没有价格，尝试获取
  if (!priceUsd && row.coingecko_id) {
    priceUsd = await priceService.getTokenPrice(row.coingecko_id);
  }

  return {
    id: row.id,
    symbol: row.symbol,
    decimals: row.decimals,
    priceUsd,
  };
}

// 处理 Transfer 事件
async function processTransferEvent(
  networkId: string,
  log: ethers.Log,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  try {
    const contractAddress = log.address.toLowerCase();
    
    // 1. 检查是否是我们监控的代币
    if (!state.monitoredTokens.get(networkId)?.has(contractAddress)) {
      return;
    }

    // 2. 解析事件数据
    const iface = new ethers.Interface(ERC20_ABI);
    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    
    if (!parsed) return;

    const from = parsed.args[0].toLowerCase();
    const to = parsed.args[1].toLowerCase();
    const value = parsed.args[2] as bigint;

    // 3. 获取代币信息和价格
    const tokenInfo = await getTokenInfo(networkId, contractAddress);
    if (!tokenInfo) return;

    // 4. 计算金额，先过滤小额转账
    const amountFormatted = parseFloat(ethers.formatUnits(value, tokenInfo.decimals));
    const amountUsd = tokenInfo.priceUsd ? amountFormatted * tokenInfo.priceUsd : null;

    // 最小阈值检查（默认 $1M）
    const minThreshold = parseFloat(process.env.DUMP_RADAR_MIN_USD || '1000000');
    if (!amountUsd || amountUsd < minThreshold) {
      return; // 金额太小，直接跳过，不查询任何 API
    }

    // 5. 金额 >= $1M，先查本地 Binance 地址库
    let binanceCheck = checkBinanceAddressLocal(networkId, to);
    
    // 6. 本地没有，查 Moralis API（大额转账才查，数量有限）
    if (!binanceCheck.isBinance) {
      console.log(`🔍 Large transfer $${amountUsd.toFixed(0)} to unknown address, checking Moralis...`);
      const apiResult = await checkBinanceAddress(networkId, to, true); // useApi = true
      if (apiResult.isBinance) {
        binanceCheck = { isBinance: true, label: apiResult.label };
        console.log(`  ✅ Confirmed Binance address via Moralis: ${apiResult.label}`);
      } else {
        // 不是 Binance 地址，跳过
        return;
      }
    }
    
    // 7. 检查 from 是否也是 Binance 地址（过滤内部转账）
    // 先查本地，如果是大额也查 API
    let fromIsBinance = checkBinanceAddressLocal(networkId, from);
    if (!fromIsBinance.isBinance) {
      // 对于 from 地址，也用 API 检查（避免漏掉内部转账）
      const fromApiResult = await checkBinanceAddress(networkId, from, true);
      fromIsBinance = { isBinance: fromApiResult.isBinance, label: fromApiResult.label };
    }
    
    if (fromIsBinance.isBinance) {
      // from 也是 Binance 地址，这是内部转账，跳过
      console.log(`  ⏭️ Skipping internal transfer: ${fromIsBinance.label} → Binance`);
      return;
    }

    console.log(`🔔 Large deposit detected: ${tokenInfo.symbol} $${amountUsd.toFixed(2)} to Binance`);

    // 获取交易详情
    const block = await provider.getBlock(log.blockNumber);
    const txTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

    // 使用已获取的 Binance 地址标签（优先使用 API 返回的，否则查本地）
    const binanceLabel = binanceCheck.label || await getBinanceLabel(networkId, to);

    // 获取发送方标签
    const fromLabel = await addressLabelService.getAddressLabel(networkId, from, { checkWhale: true });

    // 记录事件
    const event = await dumpRadarService.recordEvent({
      tokenId: tokenInfo.id,
      networkId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      fromAddress: from,
      toAddress: to,
      toBinanceLabel: binanceLabel,
      amount: value.toString(),
      amountFormatted,
      amountUsd,
      priceAtTime: tokenInfo.priceUsd || 0,
      fromLabel: fromLabel.label,
      fromTag: fromLabel.tag,
      txTimestamp,
    });

    if (event) {
      // 获取网络信息
      const networkConfig = NETWORK_CONFIGS.find(n => n.id === networkId);
      
      // 广播 WebSocket 事件
      broadcastDumpRadarEvent({
        ...event,
        token_symbol: tokenInfo.symbol,
        network_name: networkConfig?.name || networkId,
        explorer_url: getExplorerUrl(networkId),
      });

      // 发送 Telegram 通知
      const token = await dumpRadarService.getToken(tokenInfo.id);
      if (token) {
        await dumpRadarService.sendDumpRadarNotification(
          event,
          token,
          networkConfig?.name || networkId,
          getExplorerUrl(networkId)
        );
      }
    }
  } catch (error) {
    console.error('Error processing transfer event:', error);
  }
}

// 获取 Binance 地址标签
async function getBinanceLabel(networkId: string, address: string): Promise<string | null> {
  const result = await db.query<{ label: string }>(
    `SELECT label FROM binance_addresses 
     WHERE network_id = $1 AND LOWER(address) = LOWER($2)`,
    [networkId, address]
  );
  return result.rows[0]?.label || null;
}

// 获取区块浏览器 URL
function getExplorerUrl(networkId: string): string {
  const urls: Record<string, string> = {
    'eth': 'https://etherscan.io',
    'bsc': 'https://bscscan.com',
    'arb': 'https://arbiscan.io',
    'base': 'https://basescan.org',
  };
  return urls[networkId] || 'https://etherscan.io';
}

// 扫描历史区块
async function scanHistoricalBlocks(
  networkId: string,
  provider: ethers.JsonRpcProvider,
  fromBlock: number,
  toBlock: number
): Promise<void> {
  const tokens = state.monitoredTokens.get(networkId);
  if (!tokens || tokens.size === 0) return;

  const binanceAddresses = state.binanceAddresses.get(networkId);
  if (!binanceAddresses || binanceAddresses.size === 0) return;

  console.log(`🔍 Scanning ${networkId} blocks ${fromBlock} to ${toBlock}...`);

  try {
    // 为每个代币创建 filter
    for (const tokenAddress of tokens) {
      const filter = {
        address: tokenAddress,
        topics: [
          TRANSFER_EVENT_TOPIC,
          null, // from (any)
          // to 需要匹配 Binance 地址（但 ethers 不支持多值，所以我们在处理时过滤）
        ],
        fromBlock,
        toBlock,
      };

      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        await processTransferEvent(networkId, log, provider);
      }
    }
  } catch (error) {
    console.error(`Error scanning blocks for ${networkId}:`, error);
  }
}

// 监听新区块
async function startBlockListener(networkId: string): Promise<void> {
  const provider = state.providers.get(networkId);
  if (!provider) return;

  const config = NETWORK_CONFIGS.find(n => n.id === networkId);
  if (!config) return;

  console.log(`👂 Starting block listener for ${config.name}...`);

  provider.on('block', async (blockNumber: number) => {
    if (!state.isRunning) return;

    const lastBlock = state.lastProcessedBlock.get(networkId) || blockNumber - 1;
    
    // 如果有未处理的区块，扫描它们
    if (blockNumber > lastBlock + 1) {
      await scanHistoricalBlocks(networkId, provider, lastBlock + 1, blockNumber);
    } else {
      await scanHistoricalBlocks(networkId, provider, blockNumber, blockNumber);
    }

    state.lastProcessedBlock.set(networkId, blockNumber);
  });
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

  // 立即执行一次
  await updatePrices();

  // 每 5 分钟更新一次
  setInterval(updatePrices, 5 * 60 * 1000);
}

// 定期重新加载配置
async function startConfigReloader(): Promise<void> {
  // 每 10 分钟重新加载 Binance 地址和监控代币
  setInterval(async () => {
    if (!state.isRunning) return;
    
    try {
      await loadBinanceAddresses();
      await loadMonitoredTokens();
    } catch (error) {
      console.error('Error reloading config:', error);
    }
  }, 10 * 60 * 1000);
}


// 启动 Worker
export async function startDumpRadarWorker(): Promise<void> {
  if (state.isRunning) {
    console.log('⚠️ Dump Radar Worker is already running');
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════╗
║         🔔 Dump Radar Worker Starting            ║
╚═══════════════════════════════════════════════════╝
  `);

  try {
    // 初始化
    initProviders();
    await loadBinanceAddresses();
    await loadMonitoredTokens();

    state.isRunning = true;

    // 启动价格更新
    await startPriceUpdater();

    // 启动配置重新加载
    await startConfigReloader();

    // 为每个网络启动区块监听
    for (const [networkId] of state.providers) {
      await startBlockListener(networkId);
    }

    console.log('✅ Dump Radar Worker started successfully');
  } catch (error) {
    console.error('❌ Failed to start Dump Radar Worker:', error);
    state.isRunning = false;
    throw error;
  }
}

// 停止 Worker
export async function stopDumpRadarWorker(): Promise<void> {
  console.log('🛑 Stopping Dump Radar Worker...');
  
  state.isRunning = false;

  // 断开所有 Provider
  for (const [networkId, provider] of state.providers) {
    try {
      provider.removeAllListeners();
      await provider.destroy();
      console.log(`  Disconnected from ${networkId}`);
    } catch (error) {
      console.error(`  Error disconnecting from ${networkId}:`, error);
    }
  }

  state.providers.clear();
  console.log('✅ Dump Radar Worker stopped');
}

// 单次扫描（用于测试或手动触发）
export async function scanOnce(options: {
  networkId?: string;
  blocks?: number;
} = {}): Promise<void> {
  const { networkId, blocks = 100 } = options;
  
  console.log('🔍 Running one-time scan...');
  
  initProviders();
  await loadBinanceAddresses();
  await loadMonitoredTokens();
  await priceService.updateTokenPricesInDb();

  const networksToScan = networkId 
    ? [networkId] 
    : Array.from(state.providers.keys());

  for (const nid of networksToScan) {
    const provider = state.providers.get(nid);
    if (!provider) continue;

    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock - blocks;
      
      await scanHistoricalBlocks(nid, provider, fromBlock, currentBlock);
    } catch (error) {
      console.error(`Error scanning ${nid}:`, error);
    }
  }

  // 清理
  for (const provider of state.providers.values()) {
    await provider.destroy();
  }
  state.providers.clear();

  console.log('✅ One-time scan completed');
}

// 导出状态检查
export function getWorkerStatus(): {
  isRunning: boolean;
  networks: string[];
  monitoredTokens: number;
  binanceAddresses: number;
} {
  return {
    isRunning: state.isRunning,
    networks: Array.from(state.providers.keys()),
    monitoredTokens: Array.from(state.monitoredTokens.values())
      .reduce((sum, set) => sum + set.size, 0),
    binanceAddresses: Array.from(state.binanceAddresses.values())
      .reduce((sum, set) => sum + set.size, 0),
  };
}

