export interface SmartWallet {
  address: string;
  pnl1d: number;
  pnl7d: number;
  pnl30d: number;
  winRate7d: number;
  winRate30d: number;
  trades7d: number;
  trades30d: number;
  twitter?: string;
  lastUpdated: Date;
}

export type SortField = 
  | 'pnl1d' 
  | 'pnl7d' 
  | 'pnl30d' 
  | 'winRate7d' 
  | 'winRate30d' 
  | 'trades7d' 
  | 'trades30d';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface HyperliquidUserState {
  assetPositions: {
    position: {
      coin: string;
      entryPx: string;
      leverage: {
        type: string;
        value: number;
      };
      liquidationPx: string | null;
      marginUsed: string;
      maxTradeSzs: [string, string];
      positionValue: string;
      returnOnEquity: string;
      szi: string;
      unrealizedPnl: string;
    };
    type: string;
  }[];
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  withdrawable: string;
}

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

export interface Platform {
  id: string;
  name: string;
  logo: string;
  enabled: boolean;
}


