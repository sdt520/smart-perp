import db from '../db/index.js';

// CoinGecko API (免费版)
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

// 价格缓存（内存）
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1分钟缓存

// 从 CoinGecko 获取价格
export async function getTokenPrice(coingeckoId: string): Promise<number | null> {
  // 检查缓存
  const cached = priceCache.get(coingeckoId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`CoinGecko API error: ${response.status}`);
      return cached?.price || null;
    }

    const data = await response.json() as Record<string, { usd?: number }>;
    const price = data[coingeckoId]?.usd;

    if (price) {
      priceCache.set(coingeckoId, { price, timestamp: Date.now() });
      return price;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch price for ${coingeckoId}:`, error);
    return cached?.price || null;
  }
}

// 批量获取价格
export async function getTokenPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const toFetch: string[] = [];

  // 先检查缓存
  for (const id of coingeckoIds) {
    const cached = priceCache.get(id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      result.set(id, cached.price);
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) return result;

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/price?ids=${toFetch.join(',')}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json() as Record<string, { usd?: number }>;
      for (const id of toFetch) {
        const price = data[id]?.usd;
        if (price) {
          priceCache.set(id, { price, timestamp: Date.now() });
          result.set(id, price);
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch batch prices:', error);
  }

  return result;
}

// 通过合约地址获取价格（使用 CoinGecko 合约 API）
export async function getTokenPriceByContract(
  networkId: string,
  contractAddress: string
): Promise<number | null> {
  // CoinGecko 网络 ID 映射
  const platformMap: Record<string, string> = {
    'eth': 'ethereum',
    'bsc': 'binance-smart-chain',
    'arb': 'arbitrum-one',
    'base': 'base',
    'sol': 'solana',
  };

  const platform = platformMap[networkId];
  if (!platform) return null;

  const cacheKey = `${networkId}:${contractAddress.toLowerCase()}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/token_price/${platform}?contract_addresses=${contractAddress}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return cached?.price || null;
    }

    const data = await response.json() as Record<string, { usd?: number }>;
    const price = data[contractAddress.toLowerCase()]?.usd;

    if (price) {
      priceCache.set(cacheKey, { price, timestamp: Date.now() });
      return price;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch price for ${contractAddress}:`, error);
    return cached?.price || null;
  }
}

// 更新数据库中的代币价格
export async function updateTokenPricesInDb(): Promise<number> {
  // 获取所有有 coingecko_id 的代币
  const result = await db.query<{ id: number; coingecko_id: string }>(
    `SELECT id, coingecko_id FROM dump_radar_tokens 
     WHERE coingecko_id IS NOT NULL AND is_enabled = true`
  );

  if (result.rows.length === 0) return 0;

  const coingeckoIds = result.rows.map(r => r.coingecko_id);
  const prices = await getTokenPrices(coingeckoIds);

  let updated = 0;
  for (const row of result.rows) {
    const price = prices.get(row.coingecko_id);
    if (price) {
      await db.query(
        `UPDATE dump_radar_tokens 
         SET price_usd = $1, price_updated_at = NOW() 
         WHERE id = $2`,
        [price, row.id]
      );
      updated++;
    }
  }

  return updated;
}

// 获取代币的 USD 价值
export async function calculateUsdValue(
  tokenId: number,
  amount: number
): Promise<number | null> {
  const result = await db.query<{ price_usd: string | null; coingecko_id: string | null }>(
    'SELECT price_usd, coingecko_id FROM dump_radar_tokens WHERE id = $1',
    [tokenId]
  );

  if (result.rows.length === 0) return null;

  let price = result.rows[0].price_usd ? parseFloat(result.rows[0].price_usd) : null;

  // 如果数据库没有价格，尝试从 API 获取
  if (!price && result.rows[0].coingecko_id) {
    price = await getTokenPrice(result.rows[0].coingecko_id);
  }

  if (!price) return null;

  return amount * price;
}

