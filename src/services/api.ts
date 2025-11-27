import type { SmartWallet, SortField, SortDirection } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

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

