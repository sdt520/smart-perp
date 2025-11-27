import { useMemo, useState } from 'react';
import type { SmartWallet, SortConfig, SortField } from '../types';

interface WalletTableProps {
  wallets: SmartWallet[];
  loading?: boolean;
}

const columns: { key: SortField | 'address'; label: string; align: 'left' | 'right' }[] = [
  { key: 'address', label: '钱包地址', align: 'left' },
  { key: 'pnl1d', label: '1D PnL', align: 'right' },
  { key: 'pnl7d', label: '7D PnL', align: 'right' },
  { key: 'pnl30d', label: '30D PnL', align: 'right' },
  { key: 'winRate7d', label: '7D 胜率', align: 'right' },
  { key: 'winRate30d', label: '30D 胜率', align: 'right' },
  { key: 'trades7d', label: '7D 交易', align: 'right' },
  { key: 'trades30d', label: '30D 交易', align: 'right' },
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

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function TwitterIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (!direction) {
    return (
      <svg className="w-4 h-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
      </svg>
    );
  }
  return (
    <svg
      className={`w-4 h-4 transition-transform ${direction === 'desc' ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 14l5-5 5 5" />
    </svg>
  );
}

export function WalletTable({ wallets, loading }: WalletTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'pnl30d',
    direction: 'desc',
  });

  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aValue = a[sortConfig.field];
      const bValue = b[sortConfig.field];
      const modifier = sortConfig.direction === 'asc' ? 1 : -1;
      return (aValue - bValue) * modifier;
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
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
        <div className="p-12 text-center">
          <div className="inline-flex items-center gap-3 text-[var(--color-text-secondary)]">
            <svg
              className="w-6 h-6 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <span className="text-lg">正在加载钱包数据...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`
                    px-4 py-4 text-xs font-semibold uppercase tracking-wider
                    text-[var(--color-text-muted)]
                    ${column.align === 'right' ? 'text-right' : 'text-left'}
                    ${column.key !== 'address' ? 'cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors' : ''}
                  `}
                  onClick={() => column.key !== 'address' && handleSort(column.key as SortField)}
                >
                  <div className={`flex items-center gap-2 ${column.align === 'right' ? 'justify-end' : ''}`}>
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
                key={wallet.address}
                className="table-row-hover border-b border-[var(--color-border)]/50 last:border-b-0"
              >
                {/* Address */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent-blue)]/20 to-[var(--color-accent-green)]/20 flex items-center justify-center text-sm font-bold text-[var(--color-accent-blue)]">
                      {index + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-[var(--color-text-primary)]">
                        {shortenAddress(wallet.address)}
                      </span>
                      {wallet.twitter && (
                        <a
                          href={`https://twitter.com/${wallet.twitter}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-text-muted)] hover:text-[#1DA1F2] transition-colors"
                          title={`@${wallet.twitter}`}
                        >
                          <TwitterIcon />
                        </a>
                      )}
                    </div>
                  </div>
                </td>

                {/* 1D PnL */}
                <td className="px-4 py-4 text-right">
                  <span
                    className={`font-mono text-sm font-medium tabular-nums ${
                      wallet.pnl1d >= 0
                        ? 'text-[var(--color-accent-green)]'
                        : 'text-[var(--color-accent-red)]'
                    }`}
                  >
                    {wallet.pnl1d >= 0 ? '+' : ''}${formatPnL(wallet.pnl1d)}
                  </span>
                </td>

                {/* 7D PnL */}
                <td className="px-4 py-4 text-right">
                  <span
                    className={`font-mono text-sm font-medium tabular-nums ${
                      wallet.pnl7d >= 0
                        ? 'text-[var(--color-accent-green)]'
                        : 'text-[var(--color-accent-red)]'
                    }`}
                  >
                    {wallet.pnl7d >= 0 ? '+' : ''}${formatPnL(wallet.pnl7d)}
                  </span>
                </td>

                {/* 30D PnL */}
                <td className="px-4 py-4 text-right">
                  <span
                    className={`font-mono text-sm font-medium tabular-nums ${
                      wallet.pnl30d >= 0
                        ? 'text-[var(--color-accent-green)]'
                        : 'text-[var(--color-accent-red)]'
                    }`}
                  >
                    {wallet.pnl30d >= 0 ? '+' : ''}${formatPnL(wallet.pnl30d)}
                  </span>
                </td>

                {/* 7D Win Rate */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.winRate7d >= 60
                            ? 'bg-[var(--color-accent-green)]'
                            : wallet.winRate7d >= 50
                            ? 'bg-[var(--color-accent-blue)]'
                            : 'bg-[var(--color-accent-red)]'
                        }`}
                        style={{ width: `${Math.min(wallet.winRate7d, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        wallet.winRate7d >= 60
                          ? 'text-[var(--color-accent-green)]'
                          : wallet.winRate7d >= 50
                          ? 'text-[var(--color-accent-blue)]'
                          : 'text-[var(--color-accent-red)]'
                      }`}
                    >
                      {wallet.winRate7d.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 30D Win Rate */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.winRate30d >= 60
                            ? 'bg-[var(--color-accent-green)]'
                            : wallet.winRate30d >= 50
                            ? 'bg-[var(--color-accent-blue)]'
                            : 'bg-[var(--color-accent-red)]'
                        }`}
                        style={{ width: `${Math.min(wallet.winRate30d, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        wallet.winRate30d >= 60
                          ? 'text-[var(--color-accent-green)]'
                          : wallet.winRate30d >= 50
                          ? 'text-[var(--color-accent-blue)]'
                          : 'text-[var(--color-accent-red)]'
                      }`}
                    >
                      {wallet.winRate30d.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 7D Trades */}
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-secondary)] tabular-nums">
                    {formatNumber(wallet.trades7d)}
                  </span>
                </td>

                {/* 30D Trades */}
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-secondary)] tabular-nums">
                    {formatNumber(wallet.trades30d)}
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

