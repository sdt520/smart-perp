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
  // Use a random walk that trends towards the final value
  let cumulativePnl = 0;
  const dailyAvg = totalPnl30d / 30;
  const volatility = Math.abs(dailyAvg) * 2 + 1000; // Add some volatility
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Random daily PnL with trend towards final total
    const remainingDays = i + 1;
    const remainingPnl = totalPnl30d - cumulativePnl;
    const expectedDaily = remainingPnl / remainingDays;
    const randomFactor = (Math.random() - 0.5) * volatility;
    const dailyPnl = expectedDaily + randomFactor;
    
    cumulativePnl += dailyPnl;
    
    history.push({
      date: date.toISOString().split('T')[0],
      pnl: dailyPnl,
      cumulativePnl,
    });
  }
  
  return history;
}

// Calculate maximum drawdown from PnL history
function calculateMaxDrawdown(history: TraderDetail['pnlHistory']): number {
  if (history.length === 0) return 0;
  
  let peak = history[0].cumulativePnl;
  let maxDrawdown = 0;
  
  for (const point of history) {
    if (point.cumulativePnl > peak) {
      peak = point.cumulativePnl;
    }
    const drawdown = peak > 0 ? ((peak - point.cumulativePnl) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return Math.min(maxDrawdown, 100); // Cap at 100%
}

// Calculate Sharpe ratio (simplified)
function calculateSharpeRatio(history: TraderDetail['pnlHistory']): number {
  if (history.length < 2) return 0;
  
  const dailyReturns = history.map(h => h.pnl);
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return avgReturn > 0 ? 3 : -1;
  
  // Annualized Sharpe (assuming 365 trading days)
  const sharpe = (avgReturn / stdDev) * Math.sqrt(365);
  
  // Clamp to reasonable range
  return Math.max(-3, Math.min(5, sharpe));
}

// Backend PnL history response type
interface PnlHistoryApiResponse {
  date: string;
  pnl: number;
  cumulativePnl: number;
  tradesCount: number;
  winRate: number;
  volume: number;
}

// Fetch trader detail by address
export async function fetchTraderDetail(address: string): Promise<TraderDetail> {
  try {
    // Fetch wallet data and PnL history from backend in parallel
    const [walletResponse, pnlHistoryResponse] = await Promise.all([
      fetch(`${API_BASE}/wallets/address/${address}`),
      fetch(`${API_BASE}/wallets/address/${address}/pnl-history?days=30`),
    ]);
    
    if (!walletResponse.ok) {
      throw new Error(`API error: ${walletResponse.status}`);
    }

    const walletData: ApiResponse<WalletApiResponse> = await walletResponse.json();

    if (!walletData.success) {
      throw new Error('Failed to fetch trader detail');
    }

    const wallet = walletData.data;

    // Try to use backend PnL history (from daily snapshots)
    let pnlHistory: TraderDetail['pnlHistory'];
    
    if (pnlHistoryResponse.ok) {
      const historyData: ApiResponse<PnlHistoryApiResponse[]> = await pnlHistoryResponse.json();
      
      if (historyData.success && historyData.data.length > 0) {
        // Use real data from backend (daily snapshots)
        pnlHistory = historyData.data.map(d => ({
          date: d.date,
          pnl: d.pnl,
          cumulativePnl: d.cumulativePnl,
        }));
      } else {
        // No snapshots yet (system running < 30 days), generate from total
        pnlHistory = generatePnlHistoryFromTotal(wallet.pnl_30d);
      }
    } else {
      // Fallback to generated history
      pnlHistory = generatePnlHistoryFromTotal(wallet.pnl_30d);
    }

    // Calculate max drawdown and Sharpe ratio
    const maxDrawdown = calculateMaxDrawdown(pnlHistory);
    const sharpeRatio = calculateSharpeRatio(pnlHistory);

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
    pnlHistory,
  };
}


