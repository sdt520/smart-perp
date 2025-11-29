import { useCallback, useEffect, useState } from 'react';
import type { SmartWallet, SortConfig } from '../types';
import { fetchWallets, fetchStats, checkHealth, fetchWalletByAddress } from '../services/api';
import { mockWalletData } from '../data/sampleWallets';

// Check if a string is a valid Ethereum address
function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

interface UseWalletsOptions {
  platform?: string;
  initialSort?: SortConfig;
  initialPageSize?: number;
}

interface Stats {
  totalWallets: number;
  totalPnl30d: number;
  avgWinRate: number;
  totalTrades30d: number;
  topPerformer: SmartWallet | null;
}

export function useWallets(options: UseWalletsOptions = {}) {
  const [wallets, setWallets] = useState<SmartWallet[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(
    options.initialSort || { field: 'pnl30d', direction: 'desc' }
  );
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options.initialPageSize || 50);
  const [total, setTotal] = useState(0);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Check API availability
  useEffect(() => {
    checkHealth().then(setIsApiAvailable);
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isApiAvailable === false) {
        // Use mock data if API is not available
        console.log('API not available, using mock data');
        let filteredData = mockWalletData;
        if (searchQuery) {
          filteredData = mockWalletData.filter(w => 
            w.address.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }
        setWallets(filteredData);
        setTotal(filteredData.length);
        setStats({
          totalWallets: mockWalletData.length,
          totalPnl30d: mockWalletData.reduce((sum, w) => sum + w.pnl30d, 0),
          avgWinRate: mockWalletData.reduce((sum, w) => sum + w.winRate30d, 0) / mockWalletData.length,
          totalTrades30d: mockWalletData.reduce((sum, w) => sum + w.trades30d, 0),
          topPerformer: mockWalletData.reduce((top, w) => (w.pnl30d > (top?.pnl30d || 0) ? w : top), mockWalletData[0]),
        });
        return;
      }

      if (isApiAvailable === null) {
        // Still checking API availability
        return;
      }

      // If searching for a complete Ethereum address, fetch directly
      if (searchQuery && isValidEthAddress(searchQuery)) {
        try {
          const walletData = await fetchWalletByAddress(searchQuery);
          if (walletData) {
            // Convert API response to SmartWallet format
            const wallet: SmartWallet = {
              id: walletData.id?.toString() || searchQuery,
              address: walletData.address,
              platform: walletData.platform_name || 'Hyperliquid',
              label: walletData.label || undefined,
              twitter: walletData.twitter_handle || undefined,
              pnl1d: walletData.pnl_1d || 0,
              pnl7d: walletData.pnl_7d || 0,
              pnl30d: walletData.pnl_30d || 0,
              winRate7d: walletData.win_rate_7d || 0,
              winRate30d: walletData.win_rate_30d || 0,
              trades7d: walletData.trades_count_7d || 0,
              trades30d: walletData.trades_count_30d || 0,
              volume7d: walletData.total_volume_7d || 0,
              volume30d: walletData.total_volume_30d || 0,
              lastTradeAt: walletData.last_trade_at || undefined,
              rank: walletData.rank || undefined, // May be undefined for non-leaderboard addresses
            };
            setWallets([wallet]);
            setTotal(1);
            // Keep existing stats
            return;
          }
        } catch {
          // If direct fetch fails, continue with normal search
          console.log('Direct address fetch failed, trying normal search');
        }
      }

      // Fetch from API with pagination and search
      const offset = (page - 1) * pageSize;
      const [walletsResult, statsResult] = await Promise.all([
        fetchWallets({
          platform: options.platform,
          search: searchQuery || undefined,
          sortBy: sortConfig.field,
          sortDir: sortConfig.direction,
          limit: pageSize,
          offset: offset,
        }),
        fetchStats(options.platform),
      ]);

      setWallets(walletsResult.wallets);
      setTotal(walletsResult.total);
      setStats(statsResult);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Fallback to mock data on error
      setWallets(mockWalletData);
      setTotal(mockWalletData.length);
    } finally {
      setLoading(false);
    }
  }, [isApiAvailable, options.platform, sortConfig, page, pageSize, searchQuery]);

  // Initial fetch
  useEffect(() => {
    if (isApiAvailable !== null) {
      fetchData();
    }
  }, [fetchData, isApiAvailable]);

  // Refresh function
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Update sort (reset to page 1)
  const updateSort = useCallback((field: SortConfig['field']) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }, []);

  // Pagination controls
  const goToPage = useCallback((newPage: number) => {
    const maxPage = Math.ceil(total / pageSize);
    if (newPage >= 1 && newPage <= maxPage) {
      setPage(newPage);
    }
  }, [total, pageSize]);

  const changePageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1); // Reset to first page when changing page size
  }, []);

  // Search function (reset to page 1)
  const search = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  return {
    wallets,
    stats,
    loading,
    error,
    isApiAvailable,
    sortConfig,
    refresh,
    updateSort,
    // Pagination
    page,
    pageSize,
    total,
    totalPages,
    goToPage,
    changePageSize,
    // Search
    searchQuery,
    search,
  };
}
