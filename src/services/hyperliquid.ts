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


