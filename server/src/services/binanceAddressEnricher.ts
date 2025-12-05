/**
 * Binance 地址库自动扩充服务
 * 
 * 定期使用 Moralis API 检测新的 Binance 地址
 * 策略：查询监控代币的最近大额转账，提取 Binance 标签的地址
 */

import db from '../db/index.js';

const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const MORALIS_API_BASE = 'https://deep-index.moralis.io/api/v2.2';

// 链 ID 映射
const CHAIN_MAP: Record<string, string> = {
  'eth': '0x1',
  'bsc': '0x38',
  'arb': '0xa4b1',
  'base': '0x2105',
};

interface TransactionResult {
  from_address: string;
  to_address: string;
  from_address_label?: string;
  to_address_label?: string;
  value?: string;
}

/**
 * 通过 Moralis API 检测地址是否是 Binance
 */
async function checkAddressViaMoralis(
  networkId: string,
  address: string
): Promise<{ isBinance: boolean; label: string | null }> {
  const chain = CHAIN_MAP[networkId];
  if (!chain || !MORALIS_API_KEY) {
    return { isBinance: false, label: null };
  }

  try {
    // 查询该地址的最近交易，获取标签
    const response = await fetch(
      `${MORALIS_API_BASE}/${address}?chain=${chain}&limit=1`,
      {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY,
        },
      }
    );

    if (!response.ok) return { isBinance: false, label: null };

    const data = await response.json() as { result?: TransactionResult[] };
    
    if (data.result && data.result.length > 0) {
      const tx = data.result[0];
      
      // 检查是否有 Binance 标签
      if (tx.from_address?.toLowerCase() === address.toLowerCase() &&
          tx.from_address_label?.toLowerCase().includes('binance')) {
        return { isBinance: true, label: tx.from_address_label };
      }
      
      if (tx.to_address?.toLowerCase() === address.toLowerCase() &&
          tx.to_address_label?.toLowerCase().includes('binance')) {
        return { isBinance: true, label: tx.to_address_label };
      }
    }

    return { isBinance: false, label: null };
  } catch (error) {
    console.error('Moralis API error:', error);
    return { isBinance: false, label: null };
  }
}

/**
 * 从 Moralis 获取代币的最近大额转账
 */
async function getRecentTokenTransfers(
  networkId: string,
  tokenAddress: string,
  limit: number = 100
): Promise<TransactionResult[]> {
  const chain = CHAIN_MAP[networkId];
  if (!chain || !MORALIS_API_KEY) return [];

  try {
    const response = await fetch(
      `${MORALIS_API_BASE}/erc20/${tokenAddress}/transfers?chain=${chain}&limit=${limit}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json() as { result?: TransactionResult[] };
    return data.result || [];
  } catch (error) {
    console.error('Failed to get token transfers:', error);
    return [];
  }
}

/**
 * 添加新的 Binance 地址到数据库
 */
async function addBinanceAddress(
  networkId: string,
  address: string,
  label: string
): Promise<boolean> {
  try {
    const result = await db.query(
      `INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, 'hot_wallet', false, 'moralis', NOW(), NOW())
       ON CONFLICT (network_id, address) DO UPDATE SET
         label = COALESCE(EXCLUDED.label, binance_addresses.label),
         last_seen_at = NOW()
       RETURNING id`,
      [address.toLowerCase(), networkId, label]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Failed to add Binance address:', error);
    return false;
  }
}

/**
 * 检查地址是否已存在
 */
async function addressExists(networkId: string, address: string): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM binance_addresses WHERE network_id = $1 AND LOWER(address) = LOWER($2)',
    [networkId, address]
  );
  return result.rows.length > 0;
}

/**
 * 扫描监控代币的最近转账，发现新的 Binance 地址
 */
export async function enrichBinanceAddresses(): Promise<{
  scanned: number;
  newAddresses: number;
}> {
  if (!MORALIS_API_KEY) {
    console.log('⚠️ MORALIS_API_KEY not configured, skipping enrichment');
    return { scanned: 0, newAddresses: 0 };
  }

  console.log('🔍 Starting Binance address enrichment...');

  // 获取所有监控的代币
  const tokensResult = await db.query<{
    network_id: string;
    contract_address: string;
    symbol: string;
  }>(
    `SELECT network_id, contract_address, symbol 
     FROM dump_radar_tokens 
     WHERE is_enabled = true AND network_id IN ('eth', 'bsc', 'arb', 'base')
     LIMIT 20`  // 限制代币数量避免过多 API 调用
  );

  let scanned = 0;
  let newAddresses = 0;
  const checkedAddresses = new Set<string>();

  for (const token of tokensResult.rows) {
    console.log(`  📊 Scanning ${token.symbol} on ${token.network_id}...`);
    
    // 获取最近的转账
    const transfers = await getRecentTokenTransfers(
      token.network_id,
      token.contract_address,
      50  // 每个代币查询 50 笔
    );

    for (const tx of transfers) {
      scanned++;

      // 检查 to_address 是否有 Binance 标签
      if (tx.to_address_label?.toLowerCase().includes('binance')) {
        const cacheKey = `${token.network_id}:${tx.to_address.toLowerCase()}`;
        if (!checkedAddresses.has(cacheKey)) {
          checkedAddresses.add(cacheKey);
          
          const exists = await addressExists(token.network_id, tx.to_address);
          if (!exists) {
            const added = await addBinanceAddress(
              token.network_id,
              tx.to_address,
              tx.to_address_label
            );
            if (added) {
              console.log(`    ✅ New Binance address: ${tx.to_address.slice(0, 10)}... (${tx.to_address_label})`);
              newAddresses++;
            }
          }
        }
      }

      // 检查 from_address 是否有 Binance 标签
      if (tx.from_address_label?.toLowerCase().includes('binance')) {
        const cacheKey = `${token.network_id}:${tx.from_address.toLowerCase()}`;
        if (!checkedAddresses.has(cacheKey)) {
          checkedAddresses.add(cacheKey);
          
          const exists = await addressExists(token.network_id, tx.from_address);
          if (!exists) {
            const added = await addBinanceAddress(
              token.network_id,
              tx.from_address,
              tx.from_address_label
            );
            if (added) {
              console.log(`    ✅ New Binance address: ${tx.from_address.slice(0, 10)}... (${tx.from_address_label})`);
              newAddresses++;
            }
          }
        }
      }
    }

    // 避免 API 限流
    await sleep(500);
  }

  console.log(`✅ Enrichment complete: scanned ${scanned} transfers, found ${newAddresses} new addresses`);
  return { scanned, newAddresses };
}

/**
 * 批量检测指定地址列表
 */
export async function batchCheckAddresses(
  networkId: string,
  addresses: string[]
): Promise<{ address: string; isBinance: boolean; label: string | null }[]> {
  const results: { address: string; isBinance: boolean; label: string | null }[] = [];

  for (const address of addresses) {
    const result = await checkAddressViaMoralis(networkId, address);
    results.push({ address, ...result });
    
    // 如果是 Binance，添加到数据库
    if (result.isBinance && result.label) {
      await addBinanceAddress(networkId, address, result.label);
    }

    // 避免 API 限流
    await sleep(200);
  }

  return results;
}

/**
 * 获取当前地址库统计
 */
export async function getEnrichmentStats(): Promise<{
  total: number;
  byNetwork: Record<string, number>;
  bySource: Record<string, number>;
  recentlyAdded: number;
}> {
  const [totalResult, networkResult, sourceResult, recentResult] = await Promise.all([
    db.query<{ count: string }>('SELECT COUNT(*) as count FROM binance_addresses'),
    db.query<{ network_id: string; count: string }>(
      'SELECT network_id, COUNT(*) as count FROM binance_addresses GROUP BY network_id'
    ),
    db.query<{ source: string; count: string }>(
      'SELECT COALESCE(source, \'unknown\') as source, COUNT(*) as count FROM binance_addresses GROUP BY source'
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM binance_addresses 
       WHERE first_seen_at > NOW() - INTERVAL '24 hours'`
    ),
  ]);

  const byNetwork: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const row of networkResult.rows) {
    byNetwork[row.network_id] = parseInt(row.count, 10);
  }

  for (const row of sourceResult.rows) {
    bySource[row.source] = parseInt(row.count, 10);
  }

  return {
    total: parseInt(totalResult.rows[0].count, 10),
    byNetwork,
    bySource,
    recentlyAdded: parseInt(recentResult.rows[0].count, 10),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

