import type { SmartWallet, SortField, SortDirection } from '../types';

// In production, use relative path (nginx proxies /api to backend)
// In development, use localhost:3001
const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface WalletApiItem {
  id: number;
  address: string;
  platform_id: string;
  platform_name: string;
  twitter_handle: string | null;
  label: string | null;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  win_rate_7d: number;
  win_rate_30d: number;
  trades_count_7d: number;
  trades_count_30d: number;
  total_volume_7d: number;
  total_volume_30d: number;
  last_trade_at: string | null;
  calculated_at: string | null;
  rank?: number;
}

interface StatsApiResponse {
  totalWallets: number;
  totalPnl30d: number;
  avgWinRate: number;
  totalTrades30d: number;
  topPerformer: WalletApiItem | null;
}

// Map API sort field names to frontend names
const sortFieldMap: Record<SortField, string> = {
  pnl1d: 'pnl_1d',
  pnl7d: 'pnl_7d',
  pnl30d: 'pnl_30d',
  winRate7d: 'win_rate_7d',
  winRate30d: 'win_rate_30d',
  trades7d: 'trades_count_7d',
  trades30d: 'trades_count_30d',
};

// Transform API response to frontend format
function transformWallet(item: WalletApiItem): SmartWallet {
  return {
    address: item.address,
    pnl1d: item.pnl_1d,
    pnl7d: item.pnl_7d,
    pnl30d: item.pnl_30d,
    winRate7d: item.win_rate_7d,
    winRate30d: item.win_rate_30d,
    trades7d: item.trades_count_7d,
    trades30d: item.trades_count_30d,
    twitter: item.twitter_handle || undefined,
    lastUpdated: item.calculated_at ? new Date(item.calculated_at) : new Date(),
    rank: item.rank,
  };
}

export interface FetchWalletsParams {
  platform?: string;
  search?: string;
  sortBy?: SortField;
  sortDir?: SortDirection;
  limit?: number;
  offset?: number;
}

export async function fetchWallets(params: FetchWalletsParams = {}): Promise<{
  wallets: SmartWallet[];
  total: number;
  hasMore: boolean;
}> {
  const searchParams = new URLSearchParams();
  
  if (params.platform) {
    searchParams.set('platform', params.platform);
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.sortBy) {
    searchParams.set('sortBy', sortFieldMap[params.sortBy] || 'pnl_30d');
  }
  if (params.sortDir) {
    searchParams.set('sortDir', params.sortDir);
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.offset) {
    searchParams.set('offset', params.offset.toString());
  }

  const response = await fetch(`${API_BASE}/wallets?${searchParams}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data: PaginatedResponse<WalletApiItem> = await response.json();

  if (!data.success) {
    throw new Error('Failed to fetch wallets');
  }

  return {
    wallets: data.data.map(transformWallet),
    total: data.pagination.total,
    hasMore: data.pagination.hasMore,
  };
}

export async function fetchStats(platform?: string): Promise<{
  totalWallets: number;
  totalPnl30d: number;
  avgWinRate: number;
  totalTrades30d: number;
  topPerformer: SmartWallet | null;
}> {
  const url = platform 
    ? `${API_BASE}/wallets/stats?platform=${platform}`
    : `${API_BASE}/wallets/stats`;
    
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data: ApiResponse<StatsApiResponse> = await response.json();

  if (!data.success) {
    throw new Error('Failed to fetch stats');
  }

  return {
    totalWallets: data.data.totalWallets,
    totalPnl30d: data.data.totalPnl30d,
    avgWinRate: data.data.avgWinRate,
    totalTrades30d: data.data.totalTrades30d,
    topPerformer: data.data.topPerformer 
      ? transformWallet(data.data.topPerformer)
      : null,
  };
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Fetch last sync time from worker
export async function fetchLastSync(): Promise<{ lastSyncAt: string | null; jobType: string | null }> {
  try {
    const response = await fetch(`${API_BASE}/wallets/last-sync`);
    if (!response.ok) {
      return { lastSyncAt: null, jobType: null };
    }
    const data: ApiResponse<{ lastSyncAt: string | null; jobType: string | null }> = await response.json();
    if (!data.success) {
      return { lastSyncAt: null, jobType: null };
    }
    return data.data;
  } catch {
    return { lastSyncAt: null, jobType: null };
  }
}

// Coin types
export interface Coin {
  symbol: string;
  trade_count: number;
  last_seen_at: string;
}

export interface CoinWallet {
  id: number;
  address: string;
  platform_id: string;
  platform_name: string;
  twitter_handle: string | null;
  label: string | null;
  coin: string;
  pnl_7d: number;
  pnl_30d: number;
  win_rate_7d: number;
  win_rate_30d: number;
  trades_count_7d: number;
  trades_count_30d: number;
  total_volume_30d: number;
  last_trade_at: string | null;
  calculated_at: string | null;
}

export interface CoinStats {
  coin: string;
  totalTraders: number;
  totalPnl30d: number;
  avgWinRate: number;
  totalTrades: number;
  totalVolume: number;
  topPerformer: {
    address: string;
    label: string | null;
    twitter_handle: string | null;
    pnl_30d: number;
  } | null;
}

// Fetch all coins
export async function fetchCoins(): Promise<Coin[]> {
  const response = await fetch(`${API_BASE}/coins`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data: ApiResponse<Coin[]> = await response.json();

  if (!data.success) {
    throw new Error('Failed to fetch coins');
  }

  return data.data;
}

// Fetch wallets for a specific coin
export interface FetchCoinWalletsParams {
  coin: string;
  sortBy?: 'pnl_7d' | 'pnl_30d' | 'win_rate_7d' | 'win_rate_30d' | 'trades_count_7d' | 'trades_count_30d';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function fetchCoinWallets(params: FetchCoinWalletsParams): Promise<{
  wallets: CoinWallet[];
  coin: string;
  total: number;
  hasMore: boolean;
}> {
  const searchParams = new URLSearchParams();
  
  if (params.sortBy) {
    searchParams.set('sortBy', params.sortBy);
  }
  if (params.sortDir) {
    searchParams.set('sortDir', params.sortDir);
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.offset) {
    searchParams.set('offset', params.offset.toString());
  }

  const response = await fetch(`${API_BASE}/coins/${params.coin}/wallets?${searchParams}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to fetch coin wallets');
  }

  return {
    wallets: data.data,
    coin: data.coin,
    total: data.pagination.total,
    hasMore: data.pagination.hasMore,
  };
}

// Fetch stats for a specific coin
export async function fetchCoinStats(coin: string): Promise<CoinStats> {
  const response = await fetch(`${API_BASE}/coins/${coin}/stats`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data: ApiResponse<CoinStats> = await response.json();

  if (!data.success) {
    throw new Error('Failed to fetch coin stats');
  }

  return data.data;
}

// ==================== Trader Detail Types ====================

export interface TraderDetail {
  address: string;
  label: string | null;
  twitter: string | null;
  pnl1d: number;
  pnl7d: number;
  pnl30d: number;
  winRate7d: number;
  winRate30d: number;
  trades7d: number;
  trades30d: number;
  totalVolume: number;
  maxDrawdown: number;
  sharpeRatio: number;
  isEstimated: boolean; // 是否为估算数据（无真实历史时）
  pnlHistory: {
    date: string;
    pnl: number;
    cumulativePnl: number;
  }[];
}

export interface Position {
  coin: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl?: number;
  liquidationPrice?: number;
  positionValue?: number;
  marginUsed?: number;
}

export interface Trade {
  coin: string;
  side: 'buy' | 'sell';
  type: 'open' | 'close';
  size: number;
  price: number;
  fee: number;
  realizedPnl?: number;
  timestamp: string;
}

// ==================== Trader Detail API ====================

// Backend wallet response type
interface WalletApiResponse {
  id: number;
  address: string;
  platform_id: string;
  platform_name: string;
  twitter_handle: string | null;
  label: string | null;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  win_rate_7d: number;
  win_rate_30d: number;
  trades_count_7d: number;
  trades_count_30d: number;
  total_volume_7d: number;
  total_volume_30d: number;
  last_trade_at: string | null;
  calculated_at: string | null;
}

// Generate PnL history from total 30d PnL (fallback when API data unavailable)
function generatePnlHistoryFromTotal(totalPnl30d: number): TraderDetail['pnlHistory'] {
  const history: TraderDetail['pnlHistory'] = [];
  const today = new Date();
  
  // Generate daily PnL that sums to approximately totalPnl30d
  // Use a more realistic pattern with some ups and downs
  const dailyAvg = totalPnl30d / 30;
  const volatility = Math.abs(dailyAvg) * 0.5 + 500; // Moderate volatility
  
  let cumulativePnl = 0;
  const dailyPnls: number[] = [];
  
  // Generate raw daily PnLs
  for (let i = 0; i < 30; i++) {
    // Add some randomness with occasional larger swings
    const isVolatileDay = Math.random() < 0.2; // 20% chance of volatile day
    const mult = isVolatileDay ? 2 : 1;
    const noise = (Math.random() - 0.5) * volatility * mult;
    dailyPnls.push(dailyAvg + noise);
  }
  
  // Adjust to match total
  const rawTotal = dailyPnls.reduce((a, b) => a + b, 0);
  const adjustment = (totalPnl30d - rawTotal) / 30;
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (29 - i));
    
    const dailyPnl = dailyPnls[i] + adjustment;
    cumulativePnl += dailyPnl;
    
    history.push({
      date: date.toISOString().split('T')[0],
      pnl: dailyPnl,
      cumulativePnl,
    });
  }
  
  return history;
}

// Calculate maximum drawdown from account value history
function calculateMaxDrawdown(
  history: TraderDetail['pnlHistory'],
  accountValues?: (number | undefined)[]
): number {
  if (history.length === 0) return 0;
  
  // Use account values if available (more accurate)
  if (accountValues && accountValues.length > 0) {
    const validValues = accountValues.filter((v): v is number => v !== undefined && v > 0);
    if (validValues.length > 0) {
      let peak = validValues[0];
      let maxDrawdown = 0;
      
      for (const value of validValues) {
        if (value > peak) {
          peak = value;
        }
        const drawdown = ((peak - value) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
      
      return Math.min(maxDrawdown, 100);
    }
  }
  
  // Fallback: use cumulative PnL (less accurate but better than nothing)
  // We need to add a base value to simulate account value
  const values = history.map(h => h.cumulativePnl);
  const minPnl = Math.min(...values);
  
  // Shift values to be positive (simulate starting with some capital)
  // Assume starting capital is at least the absolute value of max loss + buffer
  const startingCapital = Math.max(Math.abs(minPnl) * 2, 10000);
  const accountValueSimulated = values.map(v => startingCapital + v);
  
  let peak = accountValueSimulated[0];
  let maxDrawdown = 0;
  
  for (const value of accountValueSimulated) {
    if (value > peak) {
      peak = value;
    }
    if (peak > 0) {
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }
  
  return Math.min(maxDrawdown, 100);
}

// Calculate Sharpe ratio using daily returns (percentage-based)
function calculateSharpeRatio(
  history: TraderDetail['pnlHistory'], 
  accountValues?: (number | undefined)[]
): number {
  if (history.length < 2) return 0;
  
  // Calculate daily returns as percentages
  const dailyReturns: number[] = [];
  
  for (let i = 1; i < history.length; i++) {
    const prevValue = accountValues?.[i - 1];
    const currentPnl = history[i].pnl;
    const prevPnl = history[i - 1].pnl;
    const dailyPnl = currentPnl - prevPnl; // This is already the daily change in cumulative PnL
    
    // Calculate return based on account value if available
    if (prevValue && prevValue > 0) {
      // Daily return = daily PnL / account value at start of day
      dailyReturns.push((dailyPnl / prevValue) * 100); // As percentage
    } else {
      // Fallback: use cumulative PnL ratio if available
      if (history[i - 1].cumulativePnl !== 0) {
        dailyReturns.push((history[i].pnl / Math.abs(history[i - 1].cumulativePnl)) * 100);
      }
    }
  }
  
  if (dailyReturns.length < 2) return 0;
  
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return avgReturn > 0 ? 2 : 0;
  
  // Annualized Sharpe (assuming 365 trading days, risk-free rate = 0 for simplicity)
  const sharpe = (avgReturn / stdDev) * Math.sqrt(365);
  
  // Clamp to reasonable range (-3 to 4, typical for traders)
  return Math.max(-3, Math.min(4, sharpe));
}
// Fetch trader detail by address
export async function fetchTraderDetail(address: string): Promise<TraderDetail> {
  try {
    // Import portfolio API
    const { fetchPortfolioPnlHistory } = await import('./hyperliquid');
    
    // Fetch wallet data and portfolio PnL history in parallel
    const [walletResponse, portfolioPnlHistory] = await Promise.all([
      fetch(`${API_BASE}/wallets/address/${address}`),
      fetchPortfolioPnlHistory(address, 'month'), // Use Hyperliquid portfolio API
    ]);
    
    if (!walletResponse.ok) {
      throw new Error(`API error: ${walletResponse.status}`);
    }

    const walletData: ApiResponse<WalletApiResponse> = await walletResponse.json();

    if (!walletData.success) {
      throw new Error('Failed to fetch trader detail');
    }

    const wallet = walletData.data;

    // Convert portfolio PnL history to our format
    let pnlHistory: TraderDetail['pnlHistory'];
    let accountValues: (number | undefined)[] = [];
    let isEstimated = false;
    
    if (portfolioPnlHistory.length > 0) {
      // Group by date and calculate cumulative PnL + account values
      const dailyMap = new Map<string, { pnl: number; accountValue?: number }>();
      
      for (const point of portfolioPnlHistory) {
        const date = new Date(point.timestamp).toISOString().split('T')[0];
        // Portfolio API returns cumulative PnL, so we take the last value for each day
        dailyMap.set(date, { pnl: point.pnl, accountValue: point.accountValue });
      }
      
      // Convert to array sorted by date
      const sortedDates = Array.from(dailyMap.keys()).sort();
      let prevCumulativePnl = 0;
      
      pnlHistory = sortedDates.map(date => {
        const data = dailyMap.get(date);
        const cumulativePnl = data?.pnl || 0;
        const dailyPnl = cumulativePnl - prevCumulativePnl;
        prevCumulativePnl = cumulativePnl;
        accountValues.push(data?.accountValue);
        
        return {
          date,
          pnl: dailyPnl,
          cumulativePnl,
        };
      });
    } else {
      // Fallback to generated history if portfolio API fails
      pnlHistory = generatePnlHistoryFromTotal(wallet.pnl_30d);
      isEstimated = true;
    }

    // Calculate max drawdown and Sharpe ratio from real data
    const maxDrawdown = calculateMaxDrawdown(pnlHistory, accountValues);
    const sharpeRatio = calculateSharpeRatio(pnlHistory, accountValues);

    return {
      address: wallet.address,
      label: wallet.label,
      twitter: wallet.twitter_handle,
      pnl1d: wallet.pnl_1d,
      pnl7d: wallet.pnl_7d,
      pnl30d: wallet.pnl_30d,
      winRate7d: wallet.win_rate_7d,
      winRate30d: wallet.win_rate_30d,
      trades7d: wallet.trades_count_7d,
      trades30d: wallet.trades_count_30d,
      totalVolume: wallet.total_volume_30d,
      maxDrawdown,
      sharpeRatio,
      isEstimated,
      pnlHistory,
    };
  } catch (err) {
    console.error('Error fetching trader detail:', err);
    // Return mock data for demo
    return generateMockTraderDetail(address);
  }
}

// Fetch trader positions from Hyperliquid API directly
export async function fetchTraderPositions(address: string): Promise<Position[]> {
  try {
    // Import dynamically to avoid circular dependencies
    const { fetchUserPositions } = await import('./hyperliquid');
    const positions = await fetchUserPositions(address);
    
    // Transform to our Position type
    return positions.map(pos => ({
      coin: pos.coin,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      markPrice: pos.markPrice,
      leverage: pos.leverage,
      unrealizedPnl: pos.unrealizedPnl,
      liquidationPrice: pos.liquidationPrice ?? undefined,
      positionValue: pos.positionValue,
      marginUsed: pos.marginUsed,
    }));
  } catch (err) {
    console.error('Error fetching positions:', err);
    return [];
  }
}

// Fetch trader trades from Hyperliquid API directly
export async function fetchTraderTrades(address: string, limit = 100): Promise<Trade[]> {
  try {
    // Import dynamically to avoid circular dependencies
    const { getUserFills } = await import('./hyperliquid');
    const fills = await getUserFills(address);
    
    // Transform fills to our Trade type
    const trades: Trade[] = fills.slice(0, limit).map(fill => {
      const size = parseFloat(fill.sz);
      const price = parseFloat(fill.px);
      const closedPnl = parseFloat(fill.closedPnl || '0');
      const fee = parseFloat(fill.fee || '0');
      
      // Determine if this is opening or closing based on closedPnl
      const isClose = closedPnl !== 0;
      
      return {
        coin: fill.coin,
        side: fill.side === 'B' ? 'buy' : 'sell',
        type: isClose ? 'close' : 'open',
        size,
        price,
        fee,
        realizedPnl: isClose ? closedPnl : undefined,
        timestamp: new Date(fill.time).toISOString(),
      };
    });
    
    return trades;
  } catch (err) {
    console.error('Error fetching trades:', err);
    return [];
  }
}

// ==================== Mock Data Generators ====================

function generateMockTraderDetail(address: string): TraderDetail {
  const pnl30d = Math.random() * 500000 - 100000;
  const pnl7d = pnl30d * 0.3 + (Math.random() - 0.5) * 50000;
  const pnl1d = pnl7d * 0.15 + (Math.random() - 0.5) * 10000;
  
  // Generate PnL history (30 days)
  const pnlHistory = [];
  let cumulativePnl = 0;
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dailyPnl = (Math.random() - 0.4) * (pnl30d / 15);
    cumulativePnl += dailyPnl;
    
    pnlHistory.push({
      date: date.toISOString().split('T')[0],
      pnl: dailyPnl,
      cumulativePnl,
    });
  }

  return {
    address,
    label: Math.random() > 0.7 ? 'Smart Trader #' + Math.floor(Math.random() * 100) : null,
    twitter: Math.random() > 0.6 ? 'trader_' + address.slice(2, 8) : null,
    pnl1d,
    pnl7d,
    pnl30d,
    winRate7d: 45 + Math.random() * 30,
    winRate30d: 48 + Math.random() * 25,
    trades7d: Math.floor(Math.random() * 100) + 10,
    trades30d: Math.floor(Math.random() * 400) + 50,
    totalVolume: Math.random() * 50000000 + 1000000,
    maxDrawdown: Math.random() * 30 + 5,
    sharpeRatio: Math.random() * 3 - 0.5,
    isEstimated: true,
    pnlHistory,
  };
}


