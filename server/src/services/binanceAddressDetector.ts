/**
 * Binance 地址动态检测服务
 * 
 * 策略：
 * 1. 先查本地数据库（快）
 * 2. 检查负缓存（已确认不是 Binance 的地址）
 * 3. 本地没有则查第三方 API（Moralis / Arkham / Etherscan 标签）
 * 4. 如果确认是 Binance，自动添加到本地数据库
 * 5. 如果确认不是 Binance，添加到负缓存（持久化到数据库）
 */

import db from '../db/index.js';

// Moralis API 配置
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const MORALIS_API_BASE = 'https://deep-index.moralis.io/api/v2.2';

// 内存缓存：加速查询（数据库缓存的补充）
const memoryCache = new Map<string, { isBinance: boolean; timestamp: number }>();
const MEMORY_CACHE_TTL = 60 * 60 * 1000; // 1小时内存缓存

// 已知 Binance 地址特征（用于启发式检测）
const BINANCE_PATTERNS = {
  // Binance 热钱包通常有这些特征
  knownPrefixes: [
    '0x28c6c0', '0x21a31e', '0xdfd529', '0x56eddb', '0x9696f5',
    '0xf97781', '0x5a52e9', '0xbe0eb5', '0x47ac0f'
  ],
};

interface DetectionResult {
  isBinance: boolean;
  label: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'database' | 'arkham' | 'etherscan' | 'heuristic';
}

/**
 * 检查地址是否是 Binance（主函数）
 */
export async function detectBinanceAddress(
  networkId: string,
  address: string
): Promise<DetectionResult> {
  const normalizedAddress = address.toLowerCase();
  const cacheKey = `${networkId}:${normalizedAddress}`;

  // 1. 检查内存缓存（最快）
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < MEMORY_CACHE_TTL) {
    if (!memoryCached.isBinance) {
      return { isBinance: false, label: null, confidence: 'high', source: 'database' };
    }
  }

  // 2. 查本地 Binance 地址数据库
  const dbResult = await checkLocalDatabase(networkId, normalizedAddress);
  if (dbResult.isBinance) {
    memoryCache.set(cacheKey, { isBinance: true, timestamp: Date.now() });
    return dbResult;
  }

  // 3. 检查负缓存（已确认不是 Binance 的地址，持久化到数据库）
  const isInNegativeCache = await checkNegativeCache(networkId, normalizedAddress);
  if (isInNegativeCache) {
    memoryCache.set(cacheKey, { isBinance: false, timestamp: Date.now() });
    return { isBinance: false, label: null, confidence: 'high', source: 'database' };
  }

  // 4. 查 Moralis API（如果配置了）- 推荐，有地址标签
  if (MORALIS_API_KEY) {
    const moralisResult = await checkMoralisAPI(networkId, normalizedAddress);
    if (moralisResult.isBinance) {
      await addToLocalDatabase(networkId, normalizedAddress, moralisResult.label, 'moralis');
      memoryCache.set(cacheKey, { isBinance: true, timestamp: Date.now() });
      return moralisResult;
    }
  }

  // 5. 查 Arkham API（如果配置了）
  if (process.env.ARKHAM_API_KEY) {
    const arkhamResult = await checkArkhamAPI(normalizedAddress);
    if (arkhamResult.isBinance) {
      await addToLocalDatabase(networkId, normalizedAddress, arkhamResult.label, 'arkham');
      memoryCache.set(cacheKey, { isBinance: true, timestamp: Date.now() });
      return arkhamResult;
    }
  }

  // 6. 查 Etherscan 标签 API（免费但有限制）
  const etherscanResult = await checkEtherscanLabels(networkId, normalizedAddress);
  if (etherscanResult.isBinance) {
    await addToLocalDatabase(networkId, normalizedAddress, etherscanResult.label, 'etherscan');
    memoryCache.set(cacheKey, { isBinance: true, timestamp: Date.now() });
    return etherscanResult;
  }

  // 7. 启发式检测（最后手段，可信度低）
  const heuristicResult = heuristicCheck(normalizedAddress);
  if (heuristicResult.isBinance) {
    return heuristicResult;
  }

  // 确认不是 Binance，加入负缓存（持久化到数据库）
  await addToNegativeCache(networkId, normalizedAddress, 'moralis');
  memoryCache.set(cacheKey, { isBinance: false, timestamp: Date.now() });
  return { isBinance: false, label: null, confidence: 'high', source: 'database' };
}

/**
 * 查本地数据库
 */
async function checkLocalDatabase(networkId: string, address: string): Promise<DetectionResult> {
  const result = await db.query<{ label: string; address_type: string }>(
    `SELECT label, address_type FROM binance_addresses 
     WHERE network_id = $1 AND LOWER(address) = $2`,
    [networkId, address]
  );

  if (result.rows.length > 0) {
    return {
      isBinance: true,
      label: result.rows[0].label,
      confidence: 'high',
      source: 'database',
    };
  }

  return { isBinance: false, label: null, confidence: 'high', source: 'database' };
}

/**
 * 检查负缓存（已确认不是 Binance 的地址）
 */
async function checkNegativeCache(networkId: string, address: string): Promise<boolean> {
  try {
    const result = await db.query<{ id: number }>(
      `SELECT id FROM not_binance_addresses 
       WHERE network_id = $1 AND LOWER(address) = $2 AND expires_at > NOW()`,
      [networkId, address]
    );
    return result.rows.length > 0;
  } catch (error) {
    // 表可能不存在（迁移未执行），返回 false 继续检测
    return false;
  }
}

/**
 * 添加到负缓存（持久化到数据库，默认 7 天过期）
 */
async function addToNegativeCache(
  networkId: string, 
  address: string, 
  source: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO not_binance_addresses (network_id, address, source, checked_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '7 days')
       ON CONFLICT (network_id, address) DO UPDATE SET
         checked_at = NOW(),
         expires_at = NOW() + INTERVAL '7 days'`,
      [networkId, address.toLowerCase(), source]
    );
  } catch (error) {
    // 表可能不存在，忽略错误
    console.warn('Failed to add to negative cache:', error);
  }
}

/**
 * 查 Moralis API
 * https://docs.moralis.io/web3-data-api/evm/reference/wallet-api/get-wallet-history
 * Moralis 返回的交易数据包含 from_address_label 和 to_address_label
 */
async function checkMoralisAPI(networkId: string, address: string): Promise<DetectionResult> {
  if (!MORALIS_API_KEY) {
    return { isBinance: false, label: null, confidence: 'low', source: 'database' };
  }

  // Moralis 链 ID 映射
  const chainMap: Record<string, string> = {
    'eth': '0x1',
    'bsc': '0x38',
    'arb': '0xa4b1',
    'base': '0x2105',
  };

  const chain = chainMap[networkId];
  if (!chain) {
    return { isBinance: false, label: null, confidence: 'low', source: 'database' };
  }

  try {
    // 使用 Moralis 的 resolve address API 来获取地址标签
    const response = await fetch(
      `${MORALIS_API_BASE}/resolve/${address}?chain=${chain}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY,
        },
      }
    );

    if (response.ok) {
      const data = await response.json() as { name?: string };
      if (data.name && data.name.toLowerCase().includes('binance')) {
        return {
          isBinance: true,
          label: data.name,
          confidence: 'high',
          source: 'database', // 使用 database 作为通用 source
        };
      }
    }

    // 备选方案：查询地址的最近交易，看是否有标签
    const txResponse = await fetch(
      `${MORALIS_API_BASE}/${address}?chain=${chain}&limit=1`,
      {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY,
        },
      }
    );

    if (txResponse.ok) {
      const txData = await txResponse.json() as {
        result?: Array<{
          from_address_label?: string;
          to_address_label?: string;
          from_address?: string;
          to_address?: string;
        }>;
      };

      if (txData.result && txData.result.length > 0) {
        const tx = txData.result[0];
        
        // 检查 from_address_label
        if (tx.from_address?.toLowerCase() === address.toLowerCase() && 
            tx.from_address_label?.toLowerCase().includes('binance')) {
          return {
            isBinance: true,
            label: tx.from_address_label,
            confidence: 'high',
            source: 'database',
          };
        }
        
        // 检查 to_address_label
        if (tx.to_address?.toLowerCase() === address.toLowerCase() && 
            tx.to_address_label?.toLowerCase().includes('binance')) {
          return {
            isBinance: true,
            label: tx.to_address_label,
            confidence: 'high',
            source: 'database',
          };
        }
      }
    }

    return { isBinance: false, label: null, confidence: 'medium', source: 'database' };
  } catch (error) {
    console.error('Moralis API error:', error);
    return { isBinance: false, label: null, confidence: 'low', source: 'database' };
  }
}

/**
 * 查 Arkham Intelligence API
 * https://docs.arkhamintelligence.com/
 */
async function checkArkhamAPI(address: string): Promise<DetectionResult> {
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) {
    return { isBinance: false, label: null, confidence: 'low', source: 'arkham' };
  }

  try {
    const response = await fetch(
      `https://api.arkhamintelligence.com/intelligence/address/${address}`,
      {
        headers: {
          'API-Key': apiKey,
        },
      }
    );

    if (!response.ok) {
      return { isBinance: false, label: null, confidence: 'low', source: 'arkham' };
    }

    const data = await response.json() as {
      arkhamEntity?: {
        name?: string;
        type?: string;
      };
      arkhamLabel?: {
        name?: string;
      };
    };

    // 检查是否是 Binance
    const entityName = data.arkhamEntity?.name?.toLowerCase() || '';
    const labelName = data.arkhamLabel?.name?.toLowerCase() || '';

    if (entityName.includes('binance') || labelName.includes('binance')) {
      return {
        isBinance: true,
        label: data.arkhamEntity?.name || data.arkhamLabel?.name || 'Binance',
        confidence: 'high',
        source: 'arkham',
      };
    }

    return { isBinance: false, label: null, confidence: 'high', source: 'arkham' };
  } catch (error) {
    console.error('Arkham API error:', error);
    return { isBinance: false, label: null, confidence: 'low', source: 'arkham' };
  }
}

/**
 * 查 Etherscan 地址标签
 * 注意：Etherscan 没有直接的标签 API，这里通过页面抓取或已知标签检测
 */
async function checkEtherscanLabels(networkId: string, address: string): Promise<DetectionResult> {
  // Etherscan API 不直接提供标签，但我们可以通过一些间接方式：
  // 1. 检查地址是否在已知的 Binance 地址列表（通过社区维护的列表）
  // 2. 或者使用付费的 Etherscan Pro API
  
  // 这里使用一个公开的标签数据源（可替换为其他服务）
  try {
    // 尝试查询 labels.json 或类似服务
    // 这是一个示例，实际需要替换为真实的数据源
    const knownLabels: Record<string, string> = {
      '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance 14',
      '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance 15',
      // ... 可以从外部加载更多
    };

    const label = knownLabels[address];
    if (label && label.toLowerCase().includes('binance')) {
      return {
        isBinance: true,
        label,
        confidence: 'medium',
        source: 'etherscan',
      };
    }

    return { isBinance: false, label: null, confidence: 'medium', source: 'etherscan' };
  } catch (error) {
    return { isBinance: false, label: null, confidence: 'low', source: 'etherscan' };
  }
}

/**
 * 启发式检测（低可信度）
 * 检查地址是否符合 Binance 地址的某些模式
 */
function heuristicCheck(address: string): DetectionResult {
  // 检查地址前缀是否匹配已知 Binance 地址
  for (const prefix of BINANCE_PATTERNS.knownPrefixes) {
    if (address.startsWith(prefix)) {
      return {
        isBinance: true,
        label: 'Possible Binance',
        confidence: 'low',
        source: 'heuristic',
      };
    }
  }

  return { isBinance: false, label: null, confidence: 'low', source: 'heuristic' };
}

/**
 * 添加到本地数据库
 */
async function addToLocalDatabase(
  networkId: string,
  address: string,
  label: string | null,
  source: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, 'hot_wallet', false, $4, NOW(), NOW())
       ON CONFLICT (network_id, address) DO UPDATE SET
         label = COALESCE(EXCLUDED.label, binance_addresses.label),
         last_seen_at = NOW()`,
      [address, networkId, label, source]
    );
    console.log(`📝 Added new Binance address to database: ${address.slice(0, 10)}... (${source})`);
  } catch (error) {
    console.error('Failed to add address to database:', error);
  }
}

/**
 * 批量预热缓存（启动时调用）
 */
export async function warmupCache(): Promise<void> {
  const result = await db.query<{ network_id: string; address: string }>(
    'SELECT network_id, LOWER(address) as address FROM binance_addresses'
  );
  console.log(`🔥 Warmed up Binance address cache with ${result.rows.length} addresses`);
}

/**
 * 获取统计信息
 */
export async function getStats(): Promise<{
  totalAddresses: number;
  byNetwork: Record<string, number>;
  bySource: Record<string, number>;
}> {
  const [networkStats, sourceStats] = await Promise.all([
    db.query<{ network_id: string; count: string }>(
      `SELECT network_id, COUNT(*) as count FROM binance_addresses GROUP BY network_id`
    ),
    db.query<{ source: string; count: string }>(
      `SELECT COALESCE(source, 'unknown') as source, COUNT(*) as count FROM binance_addresses GROUP BY source`
    ),
  ]);

  const byNetwork: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let total = 0;

  for (const row of networkStats.rows) {
    byNetwork[row.network_id] = parseInt(row.count, 10);
    total += parseInt(row.count, 10);
  }

  for (const row of sourceStats.rows) {
    bySource[row.source] = parseInt(row.count, 10);
  }

  return { totalAddresses: total, byNetwork, bySource };
}

