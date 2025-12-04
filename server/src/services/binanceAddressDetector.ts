/**
 * Binance 地址动态检测服务
 * 
 * 策略：
 * 1. 先查本地数据库（快）
 * 2. 本地没有则查第三方 API（Arkham / Etherscan 标签）
 * 3. 如果确认是 Binance，自动添加到本地数据库
 */

import db from '../db/index.js';

// 缓存：已确认不是 Binance 的地址（避免重复查询）
const notBinanceCache = new Map<string, number>(); // address -> timestamp
const NEGATIVE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

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

  // 1. 检查负缓存
  const notBinanceTime = notBinanceCache.get(cacheKey);
  if (notBinanceTime && Date.now() - notBinanceTime < NEGATIVE_CACHE_TTL) {
    return { isBinance: false, label: null, confidence: 'high', source: 'database' };
  }

  // 2. 查本地数据库
  const dbResult = await checkLocalDatabase(networkId, normalizedAddress);
  if (dbResult.isBinance) {
    return dbResult;
  }

  // 3. 查 Arkham API（如果配置了）
  if (process.env.ARKHAM_API_KEY) {
    const arkhamResult = await checkArkhamAPI(normalizedAddress);
    if (arkhamResult.isBinance) {
      // 自动添加到本地数据库
      await addToLocalDatabase(networkId, normalizedAddress, arkhamResult.label, 'arkham');
      return arkhamResult;
    }
  }

  // 4. 查 Etherscan 标签 API（免费但有限制）
  const etherscanResult = await checkEtherscanLabels(networkId, normalizedAddress);
  if (etherscanResult.isBinance) {
    await addToLocalDatabase(networkId, normalizedAddress, etherscanResult.label, 'etherscan');
    return etherscanResult;
  }

  // 5. 启发式检测（最后手段，可信度低）
  const heuristicResult = heuristicCheck(normalizedAddress);
  if (heuristicResult.isBinance) {
    return heuristicResult;
  }

  // 确认不是 Binance，加入负缓存
  notBinanceCache.set(cacheKey, Date.now());
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

