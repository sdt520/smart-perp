import { useState, useEffect, useCallback } from 'react';
import { Header, WalletTable, StatsCards, CoinSelector, CoinWalletTable, Pagination } from './components';
import { useWallets } from './hooks/useWallets';
import { fetchCoinWallets, fetchCoinStats, type CoinWallet, type CoinStats } from './services/api';

function App() {
  const { 
    wallets, 
    stats, 
    loading, 
    error, 
    isApiAvailable, 
    refresh,
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
  } = useWallets({
    initialSort: { field: 'pnl30d', direction: 'desc' },
    initialPageSize: 50,
  });

  // Local search input state (for debouncing)
  const [searchInput, setSearchInput] = useState('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        search(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, search]);

  // Coin filter state
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [coinWallets, setCoinWallets] = useState<CoinWallet[]>([]);
  const [coinStats, setCoinStats] = useState<CoinStats | null>(null);
  const [coinLoading, setCoinLoading] = useState(false);
  
  // Coin pagination state
  const [coinPage, setCoinPage] = useState(1);
  const [coinPageSize, setCoinPageSize] = useState(50);
  const [coinTotal, setCoinTotal] = useState(0);

  // Fetch coin data when selected
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
    setCoinPage(1); // Reset to page 1 when changing coin
    if (!coin) {
      setCoinWallets([]);
      setCoinStats(null);
      setCoinTotal(0);
    }
  };

  const handleRefresh = () => {
    if (selectedCoin) {
      fetchCoinData(selectedCoin, coinPage, coinPageSize);
    } else {
      refresh();
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
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-grid-pattern">
      <Header />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* API Status Banner */}
        {isApiAvailable === false && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-sm">
            <span className="font-medium">⚠️ 演示模式：</span> 后端 API 未连接，当前显示模拟数据。
            请启动后端服务以获取真实数据。
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)]/30 text-[var(--color-accent-red)] text-sm">
            <span className="font-medium">❌ 错误：</span> {error}
          </div>
        )}

        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            <span className="bg-gradient-to-r from-[var(--color-accent-blue)] to-[var(--color-accent-green)] bg-clip-text text-transparent">
              聪明钱
            </span>
            <span className="text-[var(--color-text-primary)]">排行榜</span>
          </h2>
          <p className="text-[var(--color-text-muted)]">
            追踪 Hyperliquid 上最成功的交易者，学习他们的交易策略 · 
            <span className="text-[var(--color-accent-blue)]">支持按代币筛选</span>
          </p>
        </div>

        {/* Stats Overview */}
        <div className="mb-8">
          {selectedCoin && coinStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-accent-blue)]/10 to-transparent border border-[var(--color-accent-blue)]/20 p-5">
                <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">{selectedCoin} 交易者</p>
                <p className="text-3xl font-bold font-mono text-[var(--color-accent-blue)]">{coinStats.totalTraders}</p>
              </div>
              <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${coinStats.totalPnl30d >= 0 ? 'from-[var(--color-accent-green)]/10' : 'from-[var(--color-accent-red)]/10'} to-transparent border ${coinStats.totalPnl30d >= 0 ? 'border-[var(--color-accent-green)]/20' : 'border-[var(--color-accent-red)]/20'} p-5`}>
                <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">30D 总 PnL</p>
                <p className={`text-3xl font-bold font-mono ${coinStats.totalPnl30d >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
                  ${(coinStats.totalPnl30d / 1000000).toFixed(2)}M
                </p>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-accent-blue)]/10 to-transparent border border-[var(--color-accent-blue)]/20 p-5">
                <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">平均胜率</p>
                <p className="text-3xl font-bold font-mono text-[var(--color-accent-blue)]">{coinStats.avgWinRate.toFixed(1)}%</p>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-accent-blue)]/10 to-transparent border border-[var(--color-accent-blue)]/20 p-5">
                <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">30D 交易数</p>
                <p className="text-3xl font-bold font-mono text-[var(--color-accent-blue)]">{coinStats.totalTrades.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <StatsCards wallets={wallets} />
          )}
        </div>

        {/* Wallet Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {selectedCoin ? `${selectedCoin} 交易者` : '钱包列表'}
                {!selectedCoin && total > 0 && (
                  <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                    ({total.toLocaleString()} 个钱包)
                  </span>
                )}
                {selectedCoin && coinTotal > 0 && (
                  <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                    ({coinTotal.toLocaleString()} 个钱包)
                  </span>
                )}
              </h3>
              
              {/* Coin Selector - 代币筛选器 */}
              <CoinSelector
                selectedCoin={selectedCoin}
                onSelectCoin={handleCoinSelect}
              />

              {/* Search Box - 搜索框 */}
              {!selectedCoin && (
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="搜索钱包地址..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10 pr-4 py-2 w-64 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-blue)] transition-colors"
                  />
                  {searchInput && (
                    <button
                      onClick={() => setSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* API Status Indicator */}
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  isApiAvailable === null 
                    ? 'bg-yellow-500 animate-pulse' 
                    : isApiAvailable 
                      ? 'bg-[var(--color-accent-green)]' 
                      : 'bg-[var(--color-accent-red)]'
                }`} />
                <span className="text-[var(--color-text-muted)]">
                  {isApiAvailable === null 
                    ? '检测中...' 
                    : isApiAvailable 
                      ? '实时数据' 
                      : '模拟数据'}
                </span>
              </div>

              <button
                onClick={handleRefresh}
                disabled={loading || coinLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-blue)]/10 border border-[var(--color-accent-blue)]/30 text-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/20 transition-all disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${(loading || coinLoading) ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm">刷新数据</span>
              </button>
            </div>
          </div>
          
          {/* Show coin-specific table or general wallet table */}
          {selectedCoin ? (
            <>
              <CoinWalletTable 
                wallets={coinWallets} 
                coin={selectedCoin} 
                loading={coinLoading} 
                startIndex={(coinPage - 1) * coinPageSize}
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
                startIndex={(page - 1) * pageSize}
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
        <div className="text-center py-8 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            数据来源: Hyperliquid API · 
            {isApiAvailable ? ' Worker 定时更新' : ' 演示数据'} · 
            <a
              href="https://hyperliquid.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-blue)] hover:underline ml-1"
            >
              了解更多
            </a>
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            🚧 V0 版本 · 仅供参考，不构成投资建议
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
