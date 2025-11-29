import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: Math.max(rect.width, 224), // min 224px (w-56)
      });
    }
  }, [isOpen]);

  useEffect(() => {
    fetchCoins()
      .then(setCoins)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredCoins = coins.filter(c => 
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (coin: string | null) => {
    onSelectCoin(coin);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="relative flex items-center">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all
          ${selectedCoin
            ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border-active)]'
            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
          }
        `}
      >
        <svg className="w-4 h-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        {selectedCoin ? (
          <span className="font-mono">{selectedCoin}</span>
        ) : (
          <span>筛选代币</span>
        )}
        <svg
          className={`w-4 h-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown - rendered via Portal */}
      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Panel */}
          <div 
            className="fixed z-[9999] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {/* Search */}
            <div className="p-2.5 border-b border-[var(--color-border)]">
              <input
                type="text"
                placeholder="搜索代币..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-all hover:border-[var(--color-border-hover)]"
                autoFocus
              />
            </div>

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {/* All option */}
              <button
                onClick={() => handleSelect(null)}
                className={`
                  w-full px-4 py-2.5 text-left flex items-center justify-between
                  transition-colors hover:bg-[var(--color-bg-tertiary)]
                  ${!selectedCoin ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}
                `}
              >
                <span className="text-sm">全部代币</span>
                {!selectedCoin && (
                  <svg className="w-4 h-4 text-[var(--color-accent-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>

              {loading ? (
                <div className="px-4 py-6 text-center text-[var(--color-text-muted)] text-sm">
                  <svg className="w-4 h-4 animate-spin mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  加载中...
                </div>
              ) : filteredCoins.length === 0 ? (
                <div className="px-4 py-6 text-center text-[var(--color-text-muted)] text-sm">
                  未找到代币
                </div>
              ) : (
                filteredCoins.map((coin) => (
                  <button
                    key={coin.symbol}
                    onClick={() => handleSelect(coin.symbol)}
                    className={`
                      w-full px-4 py-2.5 text-left flex items-center justify-between
                      transition-colors hover:bg-[var(--color-bg-tertiary)]
                      ${selectedCoin === coin.symbol ? 'bg-[var(--color-bg-tertiary)]' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm ${selectedCoin === coin.symbol ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                        {coin.symbol}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {coin.trade_count.toLocaleString()}
                      </span>
                    </div>
                    {selectedCoin === coin.symbol && (
                      <svg className="w-4 h-4 text-[var(--color-accent-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
