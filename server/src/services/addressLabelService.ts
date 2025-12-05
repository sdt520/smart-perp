import db from '../db/index.js';

// 地址标签类型
export type AddressTag = 'project_team' | 'fund' | 'whale' | 'exchange' | 'unknown';

export interface AddressLabel {
  address: string;
  label: string | null;
  tag: AddressTag;
  source: string;
}

// 内存缓存
const labelCache = new Map<string, AddressLabel>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const cacheTimestamps = new Map<string, number>();

// 已知地址数据库（本地维护，可扩展）
// 这里预置一些知名地址，实际项目中可以从数据库或外部 API 获取
const KNOWN_ADDRESSES: Record<string, Record<string, { label: string; tag: AddressTag }>> = {
  eth: {
    // 交易所
    '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance 14', tag: 'exchange' },
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label: 'Binance 15', tag: 'exchange' },
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': { label: 'Binance 16', tag: 'exchange' },
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f': { label: 'Binance 17', tag: 'exchange' },
    '0xf977814e90da44bfa03b6295a0616a897441acec': { label: 'Binance 8', tag: 'exchange' },
    '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': { label: 'Binance Cold Wallet', tag: 'exchange' },
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { label: 'Binance', tag: 'exchange' },
    
    // 基金/VC
    '0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0': { label: 'Jump Trading', tag: 'fund' },
    '0x9aa99c23f67c81701c772b106b4f83f6e858dd2a': { label: 'Three Arrows Capital', tag: 'fund' },
    '0x1b7baa734c00298b9429b518d621753bb0f6eff2': { label: 'Paradigm', tag: 'fund' },
    '0x0548f59fee79f8832c299e01dca5c76f034f558e': { label: 'a]6z', tag: 'fund' },
    '0x6b75d8af000000e20b7a7ddf000ba900b4009a80': { label: 'Wintermute', tag: 'fund' },
    
    // 知名项目方
    '0x6982508145454ce325ddbe47a25d4ec3d2311933': { label: 'PEPE Deployer', tag: 'project_team' },
    '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { label: 'SHIB Token', tag: 'project_team' },
  },
  bsc: {
    '0x8894e0a0c962cb723c1976a4421c95949be2d4e3': { label: 'Binance Hot Wallet', tag: 'exchange' },
    '0xe2fc31f816a9b94326492132018c3aecc4a93ae1': { label: 'Binance Hot Wallet 2', tag: 'exchange' },
  },
  arb: {
    '0xb38e8c17e38363af6ebdcb3dae12e0243582891d': { label: 'Binance Arbitrum', tag: 'exchange' },
  },
  sol: {
    // Solana Binance 地址
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': { label: 'Binance Hot Wallet 1', tag: 'exchange' },
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': { label: 'Binance Hot Wallet 2', tag: 'exchange' },
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': { label: 'Binance Hot Wallet 3', tag: 'exchange' },
    // Solana 知名地址
    'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5': { label: 'Jump Trading', tag: 'fund' },
    'H69SYLkCNaVWp2f5yWB1zMaLxJ4Cz7ZE8P5xH1FmYqfH': { label: 'Alameda Research', tag: 'fund' },
  },
};

// 从本地数据获取地址标签
function getKnownAddressLabel(networkId: string, address: string): AddressLabel | null {
  const networkAddresses = KNOWN_ADDRESSES[networkId];
  if (!networkAddresses) return null;
  
  const known = networkAddresses[address.toLowerCase()];
  if (!known) return null;
  
  return {
    address: address.toLowerCase(),
    label: known.label,
    tag: known.tag,
    source: 'local',
  };
}

// 从数据库获取地址标签（用于存储用户添加的标签）
async function getDbAddressLabel(networkId: string, address: string): Promise<AddressLabel | null> {
  // 检查是否是 Binance 地址
  const binanceResult = await db.query<{ label: string; address_type: string }>(
    `SELECT label, address_type FROM binance_addresses 
     WHERE network_id = $1 AND LOWER(address) = LOWER($2)`,
    [networkId, address]
  );
  
  if (binanceResult.rows.length > 0) {
    return {
      address: address.toLowerCase(),
      label: binanceResult.rows[0].label,
      tag: 'exchange',
      source: 'database',
    };
  }
  
  return null;
}

// Etherscan API 获取地址标签（可选，需要 API Key）
async function getEtherscanLabel(networkId: string, address: string): Promise<AddressLabel | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;
  
  const apiBaseMap: Record<string, string> = {
    'eth': 'https://api.etherscan.io/api',
    'bsc': 'https://api.bscscan.com/api',
    'arb': 'https://api.arbiscan.io/api',
    'base': 'https://api.basescan.org/api',
  };
  
  const apiBase = apiBaseMap[networkId];
  if (!apiBase) return null;
  
  try {
    // Etherscan 的标签 API 需要 Pro 版本，这里只是示例
    // 实际上免费版只能通过检查是否是合约来推断
    const response = await fetch(
      `${apiBase}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json() as { 
      status: string; 
      result: Array<{ ContractName?: string }> 
    };
    
    if (data.status === '1' && data.result?.[0]?.ContractName) {
      return {
        address: address.toLowerCase(),
        label: data.result[0].ContractName,
        tag: 'project_team', // 合约地址通常是项目方
        source: 'etherscan',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan API error:', error);
    return null;
  }
}

// 检查是否是鲸鱼（根据历史大额交易）
async function checkIfWhale(networkId: string, address: string): Promise<boolean> {
  // 检查该地址是否有大额充值历史
  const result = await db.query<{ count: string; total_usd: string }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount_usd), 0) as total_usd
     FROM dump_radar_events 
     WHERE network_id = $1 AND LOWER(from_address) = LOWER($2)`,
    [networkId, address]
  );
  
  if (result.rows.length > 0) {
    const totalUsd = parseFloat(result.rows[0].total_usd);
    // 如果累计充值超过 500 万美金，认为是鲸鱼
    return totalUsd >= 5000000;
  }
  
  return false;
}

// 获取地址标签（主函数）
export async function getAddressLabel(
  networkId: string,
  address: string,
  options: { checkWhale?: boolean; checkEtherscan?: boolean } = {}
): Promise<AddressLabel> {
  const cacheKey = `${networkId}:${address.toLowerCase()}`;
  
  // 检查缓存
  const cached = labelCache.get(cacheKey);
  const cacheTime = cacheTimestamps.get(cacheKey);
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }
  
  // 1. 先检查本地已知地址
  const knownLabel = getKnownAddressLabel(networkId, address);
  if (knownLabel) {
    labelCache.set(cacheKey, knownLabel);
    cacheTimestamps.set(cacheKey, Date.now());
    return knownLabel;
  }
  
  // 2. 检查数据库
  const dbLabel = await getDbAddressLabel(networkId, address);
  if (dbLabel) {
    labelCache.set(cacheKey, dbLabel);
    cacheTimestamps.set(cacheKey, Date.now());
    return dbLabel;
  }
  
  // 3. 可选：检查 Etherscan
  if (options.checkEtherscan) {
    const etherscanLabel = await getEtherscanLabel(networkId, address);
    if (etherscanLabel) {
      labelCache.set(cacheKey, etherscanLabel);
      cacheTimestamps.set(cacheKey, Date.now());
      return etherscanLabel;
    }
  }
  
  // 4. 可选：检查是否是鲸鱼
  if (options.checkWhale) {
    const isWhale = await checkIfWhale(networkId, address);
    if (isWhale) {
      const whaleLabel: AddressLabel = {
        address: address.toLowerCase(),
        label: 'Whale',
        tag: 'whale',
        source: 'analysis',
      };
      labelCache.set(cacheKey, whaleLabel);
      cacheTimestamps.set(cacheKey, Date.now());
      return whaleLabel;
    }
  }
  
  // 5. 未知地址
  const unknownLabel: AddressLabel = {
    address: address.toLowerCase(),
    label: null,
    tag: 'unknown',
    source: 'none',
  };
  labelCache.set(cacheKey, unknownLabel);
  cacheTimestamps.set(cacheKey, Date.now());
  return unknownLabel;
}

// 批量获取地址标签
export async function getAddressLabels(
  networkId: string,
  addresses: string[]
): Promise<Map<string, AddressLabel>> {
  const result = new Map<string, AddressLabel>();
  
  for (const address of addresses) {
    const label = await getAddressLabel(networkId, address);
    result.set(address.toLowerCase(), label);
  }
  
  return result;
}

// 添加自定义地址标签到数据库
export async function addCustomLabel(
  networkId: string,
  address: string,
  label: string,
  tag: AddressTag
): Promise<void> {
  // 如果是交易所地址，添加到 binance_addresses 表
  if (tag === 'exchange') {
    await db.query(
      `INSERT INTO binance_addresses (address, network_id, label, address_type, source)
       VALUES ($1, $2, $3, 'hot_wallet', 'manual')
       ON CONFLICT (network_id, address) DO UPDATE SET
         label = EXCLUDED.label`,
      [address.toLowerCase(), networkId, label]
    );
  }
  
  // 清除缓存
  const cacheKey = `${networkId}:${address.toLowerCase()}`;
  labelCache.delete(cacheKey);
  cacheTimestamps.delete(cacheKey);
}

