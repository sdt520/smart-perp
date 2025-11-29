import { useMemo, useState } from 'react';
import type { CoinWallet } from '../services/api';
import { WalletAddress } from './WalletAddress';

interface CoinWalletTableProps {
  wallets: CoinWallet[];
  coin: string;
  loading?: boolean;
  startIndex?: number;
  total?: number;
}

type SortField = 'pnl_7d' | 'pnl_30d' | 'win_rate_7d' | 'win_rate_30d' | 'trades_count_7d' | 'trades_count_30d';

const columns: { key: SortField | 'address'; label: string; align: 'left' | 'right' }[] = [
  { key: 'address', label: '钱包地址', align: 'left' },
  { key: 'pnl_7d', label: '7D PnL', align: 'right' },
  { key: 'pnl_30d', label: '30D PnL', align: 'right' },
  { key: 'win_rate_7d', label: '7D 胜率', align: 'right' },
  { key: 'win_rate_30d', label: '30D 胜率', align: 'right' },
  { key: 'trades_count_7d', label: '7D 交易', align: 'right' },
  { key: 'trades_count_30d', label: '30D 交易', align: 'right' },
];

function formatPnL(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

function formatNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

function TwitterIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded transition-colors ${
        copied
          ? 'text-[var(--color-accent-primary)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
      }`}
      title={copied ? '已复制' : '复制地址'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (!direction) {
    return (
      <svg className="w-3.5 h-3.5 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
      </svg>
    );
  }
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${direction === 'desc' ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M7 14l5-5 5 5" />
    </svg>
  );
}

export function CoinWalletTable({ wallets, coin, loading, startIndex = 0 }: CoinWalletTableProps) {
  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: 'asc' | 'desc' }>({
    field: 'pnl_30d',
    direction: 'desc',
  });

  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aValue = a[sortConfig.field];
      const bValue = b[sortConfig.field];
      const modifier = sortConfig.direction === 'asc' ? 1 : -1;
      return ((aValue || 0) - (bValue || 0)) * modifier;
    });
  }, [wallets, sortConfig]);

  const handleSort = (field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
        <div className="p-16 text-center">
          <div className="inline-flex items-center gap-3 text-[var(--color-text-tertiary)]">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <span>正在加载 {coin} 交易者数据...</span>
          </div>
        </div>
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
        <div className="p-16 text-center">
          <div className="text-[var(--color-text-muted)]">
            <svg className="w-10 h-10 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <p className="text-base">暂无 {coin} 的交易数据</p>
            <p className="text-sm mt-2 opacity-60">等待 Worker 同步更多数据</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
      {/* Coin Badge */}
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <span className="px-2.5 py-1 rounded-md bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] font-mono text-sm">
          {coin}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`
                    px-4 py-4 text-xs font-medium tracking-wide
                    text-[var(--color-text-muted)]
                    ${column.align === 'right' ? 'text-right' : 'text-left'}
                    ${column.key !== 'address' ? 'cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors' : ''}
                  `}
                  onClick={() => column.key !== 'address' && handleSort(column.key as SortField)}
                >
                  <div className={`flex items-center gap-1.5 ${column.align === 'right' ? 'justify-end' : ''}`}>
                    {column.label}
                    {column.key !== 'address' && (
                      <SortIcon
                        direction={sortConfig.field === column.key ? sortConfig.direction : null}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedWallets.map((wallet, index) => (
              <tr
                key={wallet.id}
                className="table-row-hover border-b border-[var(--color-border)]/50 last:border-b-0"
              >
                {/* Address */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-medium text-[var(--color-text-tertiary)]">
                      {startIndex + index + 1}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <WalletAddress 
                          address={wallet.address}
                          linkTo={`/trader/${wallet.address}`}
                        />
                        <CopyButton address={wallet.address} />
                        {wallet.twitter_handle && (
                          <a
                            href={`https://twitter.com/${wallet.twitter_handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                            title={`@${wallet.twitter_handle}`}
                          >
                            <TwitterIcon />
                          </a>
                        )}
                      </div>
                      {wallet.label && (
                        <span className="text-xs text-[var(--color-text-muted)]">{wallet.label}</span>
                      )}
                    </div>
                  </div>
                </td>

                {/* 7D PnL */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      wallet.pnl_7d >= 0
                        ? 'text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-accent-negative)]'
                    }`}
                  >
                    {wallet.pnl_7d >= 0 ? '+' : ''}${formatPnL(wallet.pnl_7d)}
                  </span>
                </td>

                {/* 30D PnL */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      wallet.pnl_30d >= 0
                        ? 'text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-accent-negative)]'
                    }`}
                  >
                    {wallet.pnl_30d >= 0 ? '+' : ''}${formatPnL(wallet.pnl_30d)}
                  </span>
                </td>

                {/* 7D Win Rate */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.win_rate_7d >= 60
                            ? 'bg-[var(--color-accent-primary)]'
                            : wallet.win_rate_7d >= 50
                            ? 'bg-[var(--color-text-tertiary)]'
                            : 'bg-[var(--color-accent-negative)]'
                        }`}
                        style={{ width: `${Math.min(wallet.win_rate_7d || 0, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)] w-12 text-right">
                      {(wallet.win_rate_7d || 0).toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 30D Win Rate */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.win_rate_30d >= 60
                            ? 'bg-[var(--color-accent-primary)]'
                            : wallet.win_rate_30d >= 50
                            ? 'bg-[var(--color-text-tertiary)]'
                            : 'bg-[var(--color-accent-negative)]'
                        }`}
                        style={{ width: `${Math.min(wallet.win_rate_30d || 0, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)] w-12 text-right">
                      {(wallet.win_rate_30d || 0).toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 7D Trades */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)] tabular-nums">
                    {formatNumber(wallet.trades_count_7d || 0)}
                  </span>
                </td>

                {/* 30D Trades */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)] tabular-nums">
                    {formatNumber(wallet.trades_count_30d || 0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
