export interface Platform {
  id: string;
  name: string;
  api_base_url: string | null;
  is_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Wallet {
  id: number;
  address: string;
  platform_id: string;
  twitter_handle: string | null;
  label: string | null;
  is_active: boolean;
  discovered_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WalletMetrics {
  id: number;
  wallet_id: number;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  win_rate_7d: number;
  win_rate_30d: number;
  trades_count_7d: number;
  trades_count_30d: number;
  total_volume_7d: number;
  total_volume_30d: number;
  avg_leverage: number;
  last_trade_at: Date | null;
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Trade {
  id: number;
  wallet_id: number;
  platform_id: string;
  tx_hash: string;
  coin: string;
  side: string;
  size: number;
  price: number;
  closed_pnl: number;
  fee: number;
  leverage: number;
  is_win: boolean | null;
  traded_at: Date;
  created_at: Date;
}

export interface LeaderboardSnapshot {
  id: number;
  platform_id: string;
  wallet_address: string;
  rank: number | null;
  period: string;
  pnl: number | null;
  roi: number | null;
  snapshot_at: Date;
  created_at: Date;
}

export interface SyncJob {
  id: number;
  job_type: string;
  platform_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// API Response Types
export interface WalletLeaderboardItem {
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
  last_trade_at: Date | null;
  calculated_at: Date | null;
}

export type SortField = 
  | 'pnl_1d' 
  | 'pnl_7d' 
  | 'pnl_30d' 
  | 'win_rate_7d' 
  | 'win_rate_30d' 
  | 'trades_count_7d' 
  | 'trades_count_30d';

export type SortDirection = 'asc' | 'desc';

// Hyperliquid API Types
export interface HyperliquidFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

export interface HyperliquidLeaderboardEntry {
  ethAddress: string;
  accountValue: string;
  windowPerformances: Array<[string, { pnl: string; roi: string; vlm: string }]>;
}

