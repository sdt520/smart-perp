import { useEffect, useState } from 'react';
import { Header, WalletTable, StatsCards } from './components';
import { mockWalletData } from './data/sampleWallets';
import type { SmartWallet } from './types';

function App() {
  const [wallets, setWallets] = useState<SmartWallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API loading with mock data
    // In production, replace with actual API call:
    // fetchMultipleWallets(sampleWallets).then(setWallets)
    const timer = setTimeout(() => {
      setWallets(mockWalletData);
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-grid-pattern">
      <Header />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            <span className="bg-gradient-to-r from-[var(--color-accent-blue)] to-[var(--color-accent-green)] bg-clip-text text-transparent">
              聪明钱
            </span>
            <span className="text-[var(--color-text-primary)]">排行榜</span>
          </h2>
          <p className="text-[var(--color-text-muted)]">
            追踪 Hyperliquid 上最成功的交易者，学习他们的交易策略
          </p>
        </div>

        {/* Stats Overview */}
        <div className="mb-8">
          <StatsCards wallets={wallets} />
        </div>

        {/* Wallet Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              钱包列表
            </h3>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-blue)]/50 transition-all">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm">搜索钱包</span>
              </button>
              <button
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => {
                    setWallets(mockWalletData);
                    setLoading(false);
                  }, 1000);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent-blue)]/10 border border-[var(--color-accent-blue)]/30 text-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/20 transition-all"
              >
                <svg
                  className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
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
          <WalletTable wallets={wallets} loading={loading} />
        </div>

        {/* Footer Info */}
        <div className="text-center py-8 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            数据来源: Hyperliquid API · 每 5 分钟更新一次 · 
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
