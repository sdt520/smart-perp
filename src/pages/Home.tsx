import { useState, useEffect, useCallback } from 'react';
import { WalletTable, StatsCards, CoinSelector, CoinWalletTable, Pagination } from '../components';
import { useWallets } from '../hooks/useWallets';
import { fetchCoinWallets, fetchCoinStats, type CoinWallet, type CoinStats } from '../services/api';

function formatLargeNumber(num: number): string {
  const absValue = Math.abs(num);
  if (absValue >= 1000000000) {
    return `${(num / 1000000000).toFixed(2)}B`;
  } else if (absValue >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

export function Home() {
  const { 
    wallets, 
    loading, 
    error, 
    isApiAvailable, 
    page,
    pageSize,
    total,
    totalPages,
    goToPage,
    changePageSize,
    searchQuery,
    search,
    sortConfig,
    updateSort,
  } = useWallets({
    initialSort: { field: 'pnl30d', direction: 'desc' },
    initialPageSize: 50,
  });

  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        search(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, search]);

  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [coinWallets, setCoinWallets] = useState<CoinWallet[]>([]);
  const [coinStats, setCoinStats] = useState<CoinStats | null>(null);
  const [coinLoading, setCoinLoading] = useState(false);
  
  const [coinPage, setCoinPage] = useState(1);
  const [coinPageSize, setCoinPageSize] = useState(50);
  const [coinTotal, setCoinTotal] = useState(0);

  const fetchCoinData = useCallback(async (coin: string, p: number, ps: number) => {
    setCoinLoading(true);
    try {
      const offset = (p - 1) * ps;
      const [walletsData, statsData] = await Promise.all([
        fetchCoinWallets({ coin, sortBy: 'pnl_30d', sortDir: 'desc', limit: ps, offset }),
        fetchCoinStats(coin),
      ]);
      setCoinWallets(walletsData.wallets);
      setCoinTotal(walletsData.total);
      setCoinStats(statsData);
    } catch (err) {
      console.error('Error fetching coin data:', err);
    } finally {
      setCoinLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCoin && isApiAvailable) {
      fetchCoinData(selectedCoin, coinPage, coinPageSize);
    }
  }, [selectedCoin, isApiAvailable, fetchCoinData, coinPage, coinPageSize]);

  const handleCoinSelect = (coin: string | null) => {
    setSelectedCoin(coin);
    setCoinPage(1);
    if (!coin) {
      setCoinWallets([]);
      setCoinStats(null);
      setCoinTotal(0);
    }
  };

  const handleCoinPageChange = (newPage: number) => {
    setCoinPage(newPage);
  };

  const handleCoinPageSizeChange = (newSize: number) => {
    setCoinPageSize(newSize);
    setCoinPage(1);
  };

  const coinTotalPages = Math.ceil(coinTotal / coinPageSize);

  return (
    <>
      {/* API Status Banner */}
      {isApiAvailable === false && (
        <div className="mb-8 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-400/90 text-sm animate-fade-in">
          <span className="font-medium">演示模式</span>
          <span className="mx-2 opacity-40">·</span>
          后端 API 未连接，当前显示模拟数据
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-8 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400/90 text-sm animate-fade-in">
          <span className="font-medium">错误</span>
          <span className="mx-2 opacity-40">·</span>
          {error}
        </div>
      )}

      {/* Page Title */}
      <div className="mb-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-3">
          <span className="text-[var(--color-text-primary)]">聪明钱</span>
          <span className="text-[var(--color-text-tertiary)]">排行榜</span>
        </h2>
        <p className="text-[var(--color-text-tertiary)] text-base">
          追踪 Hyperliquid 上最成功的交易者，学习他们的交易策略
        </p>
      </div>

      {/* Stats Overview */}
      <div className="mb-10">
        {selectedCoin && coinStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-6 animate-fade-in">
              <p className="text-sm text-[var(--color-text-tertiary)] mb-2">{selectedCoin} 交易者</p>
              <p className="text-2xl font-semibold font-mono text-[var(--color-text-primary)]">{coinStats.totalTraders}</p>
            </div>
            <div className="glass-card rounded-2xl p-6 animate-fade-in">
              <p className="text-sm text-[var(--color-text-tertiary)] mb-2">30D 总 PnL</p>
              <p className={`text-2xl font-semibold font-mono ${coinStats.totalPnl30d >= 0 ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
                ${(coinStats.totalPnl30d / 1000000).toFixed(2)}M
              </p>
            </div>
            <div className="glass-card rounded-2xl p-6 animate-fade-in">
              <p className="text-sm text-[var(--color-text-tertiary)] mb-2">平均胜率</p>
              <p className="text-2xl font-semibold font-mono text-[var(--color-text-primary)]">{coinStats.avgWinRate.toFixed(1)}%</p>
            </div>
            <div className="glass-card rounded-2xl p-6 animate-fade-in">
              <p className="text-sm text-[var(--color-text-tertiary)] mb-2">30天成交量</p>
              <p className="text-2xl font-semibold font-mono text-[var(--color-text-primary)]">${formatLargeNumber(coinStats.totalVolume)}</p>
            </div>
          </div>
        ) : (
          <StatsCards wallets={wallets} />
        )}
      </div>

      {/* Wallet Table */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
              {selectedCoin ? `${selectedCoin} 交易者` : 'Top 500 聪明钱'}
              {!selectedCoin && total > 0 && (
                <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                  {total.toLocaleString()} 个
                </span>
              )}
              {selectedCoin && coinTotal > 0 && (
                <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                  {coinTotal.toLocaleString()} 个
                </span>
              )}
            </h3>
            
            <CoinSelector
              selectedCoin={selectedCoin}
              onSelectCoin={handleCoinSelect}
            />
          </div>
          
          <div className="flex items-center gap-4">
            {!selectedCoin && (
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="搜索任意钱包地址..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-60 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-all hover:border-[var(--color-border-hover)]"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isApiAvailable === null 
                  ? 'bg-amber-500 animate-pulse-subtle' 
                  : isApiAvailable 
                    ? 'bg-[var(--color-accent-primary)]' 
                    : 'bg-[var(--color-text-muted)]'
              }`} />
              <span className="text-[var(--color-text-muted)] text-xs">
                {isApiAvailable === null 
                  ? '检测中' 
                  : isApiAvailable 
                    ? '实时数据' 
                    : '模拟数据'}
              </span>
            </div>
          </div>
        </div>
        
        {selectedCoin ? (
          <>
            <CoinWalletTable 
              wallets={coinWallets} 
              coin={selectedCoin} 
              loading={coinLoading} 
              startIndex={(coinPage - 1) * coinPageSize}
              total={coinTotal}
            />
            {coinTotal > 0 && (
              <Pagination
                page={coinPage}
                pageSize={coinPageSize}
                total={coinTotal}
                totalPages={coinTotalPages}
                onPageChange={handleCoinPageChange}
                onPageSizeChange={handleCoinPageSizeChange}
                loading={coinLoading}
              />
            )}
          </>
        ) : (
          <>
            <WalletTable 
              wallets={wallets} 
              loading={loading} 
              sortConfig={sortConfig}
              onSort={updateSort}
            />
            {total > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPageChange={goToPage}
                onPageSizeChange={changePageSize}
                loading={loading}
              />
            )}
          </>
        )}
      </div>

      {/* Footer Info */}
      <footer className="text-center py-10 border-t border-[var(--color-border)]">
        <a
          href="https://x.com/hexiecs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <span>Built by 冷静冷静再冷静</span>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </footer>
    </>
  );
}

