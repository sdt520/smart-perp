import { useMemo, useState } from 'react';
import type { SmartWallet, SortConfig, SortField } from '../types';
import { FavoriteButton } from './FavoriteButton';
import { WalletAddress } from './WalletAddress';

interface WalletTableProps {
  wallets: SmartWallet[];
  loading?: boolean;
  startIndex?: number;
  sortConfig?: SortConfig;
  onSort?: (field: SortField) => void;
  onLoginRequired?: () => void;
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
      width="14"
      height="14"
    >
      <path d="M7 14l5-5 5 5" />
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

export function WalletTable({ wallets, loading, startIndex = 0, sortConfig, onSort, onLoginRequired }: WalletTableProps) {
  const [internalSortConfig, setInternalSortConfig] = useState<SortConfig>({
    field: 'pnl30d',
    direction: 'desc',
  });

  const currentSortConfig = sortConfig || internalSortConfig;

  const displayWallets = useMemo(() => {
    if (onSort) return wallets;
    
    return [...wallets].sort((a, b) => {
      const aValue = a[currentSortConfig.field];
      const bValue = b[currentSortConfig.field];
      const modifier = currentSortConfig.direction === 'asc' ? 1 : -1;
      return (aValue - bValue) * modifier;
    });
  }, [wallets, currentSortConfig, onSort]);

  const handleSort = (field: SortField) => {
    if (onSort) {
      onSort(field);
    } else {
      setInternalSortConfig((prev) => ({
        field,
        direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
      }));
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
        <div className="p-16 text-center">
          <div className="inline-flex items-center gap-3 text-[var(--color-text-tertiary)]">
            <svg
              className="w-5 h-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <span>正在加载钱包数据...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
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
                        direction={currentSortConfig.field === column.key ? currentSortConfig.direction : null}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayWallets.map((wallet, index) => (
              <tr
                key={wallet.address}
                className="table-row-hover border-b border-[var(--color-border)]/50 last:border-b-0"
              >
                {/* Address */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    {/* Favorite Button */}
                    <FavoriteButton 
                      address={wallet.address} 
                      onLoginRequired={onLoginRequired}
                    />
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-medium text-[var(--color-text-tertiary)]" title={wallet.rank ? `Rank #${wallet.rank}` : '不在排行榜中'}>
                      {wallet.rank ?? '-'}
                    </div>
                    <div className="flex items-center gap-2">
                      <WalletAddress 
                        address={wallet.address}
                        linkTo={`/trader/${wallet.address}`}
                      />
                      <CopyButton address={wallet.address} />
                      {wallet.twitter && (
                        <a
                          href={`https://twitter.com/${wallet.twitter}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                          title={`@${wallet.twitter}`}
                        >
                          <TwitterIcon />
                        </a>
                      )}
                    </div>
                  </div>
                </td>

                {/* 1D PnL */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      wallet.pnl1d >= 0
                        ? 'text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-accent-negative)]'
                    }`}
                  >
                    {wallet.pnl1d >= 0 ? '+' : ''}${formatPnL(wallet.pnl1d)}
                  </span>
                </td>

                {/* 7D PnL */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      wallet.pnl7d >= 0
                        ? 'text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-accent-negative)]'
                    }`}
                  >
                    {wallet.pnl7d >= 0 ? '+' : ''}${formatPnL(wallet.pnl7d)}
                  </span>
                </td>

                {/* 30D PnL */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      wallet.pnl30d >= 0
                        ? 'text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-accent-negative)]'
                    }`}
                  >
                    {wallet.pnl30d >= 0 ? '+' : ''}${formatPnL(wallet.pnl30d)}
                  </span>
                </td>

                {/* 7D Win Rate */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.winRate7d >= 60
                            ? 'bg-[var(--color-accent-primary)]'
                            : wallet.winRate7d >= 50
                            ? 'bg-[var(--color-text-tertiary)]'
                            : 'bg-[var(--color-accent-negative)]'
                        }`}
                        style={{ width: `${Math.min(wallet.winRate7d, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)] w-12 text-right">
                      {wallet.winRate7d.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 30D Win Rate */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wallet.winRate30d >= 60
                            ? 'bg-[var(--color-accent-primary)]'
                            : wallet.winRate30d >= 50
                            ? 'bg-[var(--color-text-tertiary)]'
                            : 'bg-[var(--color-accent-negative)]'
                        }`}
                        style={{ width: `${Math.min(wallet.winRate30d, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)] w-12 text-right">
                      {wallet.winRate30d.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* 7D Trades */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)] tabular-nums">
                    {formatNumber(wallet.trades7d)}
                  </span>
                </td>

                {/* 30D Trades */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)] tabular-nums">
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
