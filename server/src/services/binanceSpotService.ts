/**
 * 币安现货代币服务
 * 从币安 API 获取现货交易对列表
 */

// 币安 API
const BINANCE_API_BASE = 'https://api.binance.com';

// 缓存
let spotTokensCache: SpotToken[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1小时缓存

export interface SpotToken {
  symbol: string;        // 代币符号，如 BTC, ETH
  name: string;          // 代币名称
  contractAddress?: string; // 合约地址（如果有）
  network?: string;      // 网络
}

// 获取币安所有现货 USDT 交易对的代币
export async function getBinanceSpotTokens(): Promise<SpotToken[]> {
  // 检查缓存
  if (spotTokensCache.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
    return spotTokensCache;
  }

  try {
    // 获取交易对信息
    const response = await fetch(`${BINANCE_API_BASE}/api/v3/exchangeInfo`);
    
    if (!response.ok) {
      console.error('Binance API error:', response.status);
      return spotTokensCache; // 返回缓存
    }

    const data = await response.json() as {
      symbols: Array<{
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status: string;
      }>;
    };

    // 提取 USDT 交易对的 base asset（去重）
    const tokenSet = new Set<string>();
    const tokens: SpotToken[] = [];

    for (const pair of data.symbols) {
      // 只要 USDT 交易对且状态正常
      if (pair.quoteAsset === 'USDT' && pair.status === 'TRADING') {
        const symbol = pair.baseAsset;
        if (!tokenSet.has(symbol)) {
          tokenSet.add(symbol);
          tokens.push({
            symbol,
            name: symbol, // 币安 API 不提供名称，用符号代替
          });
        }
      }
    }

    // 按符号排序
    tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

    // 更新缓存
    spotTokensCache = tokens;
    cacheTimestamp = Date.now();

    console.log(`📊 Loaded ${tokens.length} Binance spot tokens`);
    return tokens;

  } catch (error) {
    console.error('Failed to fetch Binance spot tokens:', error);
    return spotTokensCache; // 返回缓存
  }
}

// 搜索代币
export async function searchBinanceSpotTokens(query: string): Promise<SpotToken[]> {
  const tokens = await getBinanceSpotTokens();
  const lowerQuery = query.toLowerCase();
  
  return tokens.filter(t => 
    t.symbol.toLowerCase().includes(lowerQuery) ||
    t.name.toLowerCase().includes(lowerQuery)
  ).slice(0, 50); // 最多返回 50 个
}

// 获取常见的大市值代币（用于快速选择）
export async function getTopSpotTokens(limit = 30): Promise<SpotToken[]> {
  // 这些是按市值排名的常见代币
  const topSymbols = [
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'SHIB', 'DOT',
    'LINK', 'TRX', 'MATIC', 'UNI', 'ATOM', 'LTC', 'ETC', 'XLM', 'INJ', 'FIL',
    'APT', 'NEAR', 'OP', 'ARB', 'AAVE', 'MKR', 'SNX', 'CRV', 'LDO', 'PEPE',
    'WIF', 'BONK', 'FLOKI', 'MEME', 'ORDI', 'SATS', '1000SATS', 'RATS',
  ];

  const allTokens = await getBinanceSpotTokens();
  const topTokens: SpotToken[] = [];

  // 按 topSymbols 顺序返回
  for (const symbol of topSymbols) {
    const token = allTokens.find(t => t.symbol === symbol);
    if (token) {
      topTokens.push(token);
    }
    if (topTokens.length >= limit) break;
  }

  return topTokens;
}

