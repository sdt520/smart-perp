import { useState, useEffect } from 'react';
import type { Coin } from '../services/api';
import { fetchCoins } from '../services/api';

interface CoinSelectorProps {
  selectedCoin: string | null;
  onSelectCoin: (coin: string | null) => void;
}

export function CoinSelector({ selectedCoin, onSelectCoin }: CoinSelectorProps) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchCoins()
      .then(setCoins)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredCoins = coins.filter(c => 
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
          ${selectedCoin
            ? 'bg-[var(--color-accent-blue)]/20 text-[var(--color-accent-blue)] border border-[var(--color-accent-blue)]/30'
            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-accent-blue)]/50'
          }
        `}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        {selectedCoin ? (
          <span className="font-mono">{selectedCoin}</span>
        ) : (
          <span>选择代币</span>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Panel */}
          <div className="absolute top-full mt-2 left-0 z-50 w-64 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-[var(--color-border)]">
              <input
                type="text"
                placeholder="搜索代币..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-blue)]"
              />
            </div>

            {/* Options */}
            <div className="max-h-64 overflow-y-auto">
              {/* All option */}
              <button
                onClick={() => {
                  onSelectCoin(null);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`
                  w-full px-4 py-3 text-left flex items-center justify-between
                  transition-colors hover:bg-[var(--color-bg-tertiary)]
                  ${!selectedCoin ? 'bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]' : 'text-[var(--color-text-secondary)]'}
                `}
              >
                <span className="text-sm">全部代币</span>
                {!selectedCoin && (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>

              {loading ? (
                <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
                  加载中...
                </div>
              ) : filteredCoins.length === 0 ? (
                <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
                  未找到代币
                </div>
              ) : (
                filteredCoins.map((coin) => (
                  <button
                    key={coin.symbol}
                    onClick={() => {
                      onSelectCoin(coin.symbol);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`
                      w-full px-4 py-3 text-left flex items-center justify-between
                      transition-colors hover:bg-[var(--color-bg-tertiary)]
                      ${selectedCoin === coin.symbol ? 'bg-[var(--color-accent-blue)]/10' : ''}
                    `}
                  >
                    <div>
                      <span className={`font-mono text-sm ${selectedCoin === coin.symbol ? 'text-[var(--color-accent-blue)]' : 'text-[var(--color-text-primary)]'}`}>
                        {coin.symbol}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                        {coin.trade_count.toLocaleString()} 交易
                      </span>
                    </div>
                    {selectedCoin === coin.symbol && (
                      <svg className="w-4 h-4 text-[var(--color-accent-blue)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Clear button when coin is selected */}
      {selectedCoin && (
        <button
          onClick={() => onSelectCoin(null)}
          className="ml-2 p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
          title="清除筛选"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

