import type { HyperliquidFill, SmartWallet } from '../types';

const API_BASE = 'https://api.hyperliquid.xyz';

interface InfoRequest {
  type: string;
  user?: string;
  startTime?: number;
  endTime?: number;
}

async function fetchInfo<T>(request: InfoRequest): Promise<T> {
  const response = await fetch(`${API_BASE}/info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// ==================== Position Types ====================

interface HyperliquidPosition {
  coin: string;
  szi: string;         // Size (positive = long, negative = short)
  entryPx: string;     // Entry price
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: {
    type: string;
    value: number;
  };
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
}

interface HyperliquidClearinghouseState {
  assetPositions: {
    position: HyperliquidPosition;
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

interface HyperliquidMeta {
  universe: {
    name: string;
    szDecimals: number;
  }[];
}

interface HyperliquidAllMids {
  [coin: string]: string;
}

export interface UserPosition {
  coin: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number | null;
  positionValue: number;
  marginUsed: number;
}

// Get user's clearinghouse state (positions)
export async function getUserClearinghouseState(address: string): Promise<HyperliquidClearinghouseState> {
  return fetchInfo<HyperliquidClearinghouseState>({
    type: 'clearinghouseState',
    user: address,
  });
}

// Get all mid prices
export async function getAllMids(): Promise<HyperliquidAllMids> {
  return fetchInfo<HyperliquidAllMids>({
    type: 'allMids',
  });
}

// Get meta info (for coin decimals etc)
export async function getMeta(): Promise<HyperliquidMeta> {
  return fetchInfo<HyperliquidMeta>({
    type: 'meta',
  });
}

// ==================== PnL History Types ====================

export interface DailyPnl {
  date: string;
  pnl: number;
  cumulativePnl: number;
  tradesCount: number;
}

// Fetch user's daily PnL history from fills (with pagination to get all data)
export async function fetchUserPnlHistory(address: string, days = 30): Promise<DailyPnl[]> {
  try {
    let currentStartTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Hyperliquid API returns max 2000 records per call, sorted ascending (old to new)
    // For high-frequency traders, we need to paginate through the data
    const allFills: HyperliquidFill[] = [];
    const maxIterations = 50; // Safety limit to prevent infinite loops
    
    for (let i = 0; i < maxIterations; i++) {
      const fills = await getUserFillsByTime(address, currentStartTime);
      
      if (fills.length === 0) break;
      
      allFills.push(...fills);
      
      // If we got less than 2000 records, we've got all the data
      if (fills.length < 2000) break;
      
      // Data is sorted ascending (old to new), so get the newest timestamp
      const newestTime = Math.max(...fills.map(f => f.time));
      
      // If newest time is close to now, we're done
      if (newestTime >= now - 60000) break; // Within 1 minute of now
      
      // Use newest time + 1 as next startTime to get more recent data
      currentStartTime = newestTime + 1;
    }
    
    console.log(`Fetched ${allFills.length} fills for ${address} over ${days} days`);
    
    // Group fills by date and calculate daily PnL
    const dailyMap = new Map<string, { pnl: number; tradesCount: number }>();
    
    for (const fill of allFills) {
      const date = new Date(fill.time).toISOString().split('T')[0];
      const closedPnl = parseFloat(fill.closedPnl || '0');
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { pnl: 0, tradesCount: 0 });
      }
      
      const day = dailyMap.get(date)!;
      day.pnl += closedPnl;
      day.tradesCount += 1;
    }
    
    // Generate all dates in range (fill gaps with 0)
    const result: DailyPnl[] = [];
    let cumulativePnl = 0;
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = dailyMap.get(dateStr) || { pnl: 0, tradesCount: 0 };
      cumulativePnl += dayData.pnl;
      
      result.push({
        date: dateStr,
        pnl: dayData.pnl,
        cumulativePnl,
        tradesCount: dayData.tradesCount,
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error fetching PnL history:', error);
    return [];
  }
}

// Fetch user positions with mark prices
export async function fetchUserPositions(address: string): Promise<UserPosition[]> {
  try {
    const [clearinghouseState, allMids] = await Promise.all([
      getUserClearinghouseState(address),
      getAllMids(),
    ]);

    const positions: UserPosition[] = [];

    for (const assetPosition of clearinghouseState.assetPositions) {
      const pos = assetPosition.position;
      const size = parseFloat(pos.szi);
      
      // Skip zero positions
      if (size === 0) continue;

      const coin = pos.coin;
      const markPrice = parseFloat(allMids[coin] || '0');
      const entryPrice = parseFloat(pos.entryPx);
      const unrealizedPnl = parseFloat(pos.unrealizedPnl);
      const positionValue = parseFloat(pos.positionValue);
      const marginUsed = parseFloat(pos.marginUsed);
      const leverage = pos.leverage.value;
      const liquidationPx = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;

      positions.push({
        coin,
        side: size > 0 ? 'long' : 'short',
        size: Math.abs(size),
        entryPrice,
        markPrice,
        leverage,
        unrealizedPnl,
        liquidationPrice: liquidationPx,
        positionValue,
        marginUsed,
      });
    }

    // Sort by position value (largest first)
    return positions.sort((a, b) => b.positionValue - a.positionValue);
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
}

export async function getUserFills(
  address: string,
  startTime?: number
): Promise<HyperliquidFill[]> {
  return fetchInfo<HyperliquidFill[]>({
    type: 'userFills',
    user: address,
    startTime,
  });
}

export async function getUserFillsByTime(
  address: string,
  startTime: number,
  endTime?: number
): Promise<HyperliquidFill[]> {
  return fetchInfo<HyperliquidFill[]>({
    type: 'userFillsByTime',
    user: address,
    startTime,
    endTime,
  });
}

// Calculate wallet metrics from fills
export function calculateWalletMetrics(
  address: string,
  fills: HyperliquidFill[],
  twitter?: string
): SmartWallet {
  const now = Date.now();
  const day1Ago = now - 24 * 60 * 60 * 1000;
  const day7Ago = now - 7 * 24 * 60 * 60 * 1000;
  const day30Ago = now - 30 * 24 * 60 * 60 * 1000;

  // Filter fills by time period
  const fills1d = fills.filter(f => f.time >= day1Ago);
  const fills7d = fills.filter(f => f.time >= day7Ago);
  const fills30d = fills.filter(f => f.time >= day30Ago);

  // Calculate PnL
  const pnl1d = fills1d.reduce((sum, f) => sum + parseFloat(f.closedPnl || '0'), 0);
  const pnl7d = fills7d.reduce((sum, f) => sum + parseFloat(f.closedPnl || '0'), 0);
  const pnl30d = fills30d.reduce((sum, f) => sum + parseFloat(f.closedPnl || '0'), 0);

  // Calculate win rate (trades with positive closedPnl)
  const calculateWinRate = (periodFills: HyperliquidFill[]): number => {
    const closingTrades = periodFills.filter(f => parseFloat(f.closedPnl || '0') !== 0);
    if (closingTrades.length === 0) return 0;
    const winningTrades = closingTrades.filter(f => parseFloat(f.closedPnl || '0') > 0);
    return (winningTrades.length / closingTrades.length) * 100;
  };

  return {
    address,
    pnl1d,
    pnl7d,
    pnl30d,
    winRate7d: calculateWinRate(fills7d),
    winRate30d: calculateWinRate(fills30d),
    trades7d: fills7d.length,
    trades30d: fills30d.length,
    twitter,
    lastUpdated: new Date(),
  };
}

// Batch fetch wallet data
export async function fetchWalletData(
  address: string,
  twitter?: string
): Promise<SmartWallet> {
  const day30Ago = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  try {
    const fills = await getUserFillsByTime(address, day30Ago);
    return calculateWalletMetrics(address, fills, twitter);
  } catch (error) {
    console.error(`Error fetching data for ${address}:`, error);
    // Return empty metrics on error
    return {
      address,
      pnl1d: 0,
      pnl7d: 0,
      pnl30d: 0,
      winRate7d: 0,
      winRate30d: 0,
      trades7d: 0,
      trades30d: 0,
      twitter,
      lastUpdated: new Date(),
    };
  }
}

// Fetch multiple wallets
export async function fetchMultipleWallets(
  wallets: { address: string; twitter?: string }[]
): Promise<SmartWallet[]> {
  const results = await Promise.all(
    wallets.map(w => fetchWalletData(w.address, w.twitter))
  );
  return results;
}


