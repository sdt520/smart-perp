import { useState } from 'react';
import type { TraderDetail } from '../../services/api';

interface TraderOverviewProps {
  trader: TraderDetail;
}

function formatPnL(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function TraderOverview({ trader }: TraderOverviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trader.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const stats = [
    {
      label: '30D PnL',
      value: `$${formatPnL(trader.pnl30d)}`,
      isPositive: trader.pnl30d >= 0,
      highlight: true,
    },
    {
      label: '7D PnL',
      value: `$${formatPnL(trader.pnl7d)}`,
      isPositive: trader.pnl7d >= 0,
    },
    {
      label: '1D PnL',
      value: `$${formatPnL(trader.pnl1d)}`,
      isPositive: trader.pnl1d >= 0,
    },
    {
      label: '30D 胜率',
      value: `${trader.winRate30d.toFixed(1)}%`,
      isPositive: trader.winRate30d >= 50,
    },
    {
      label: '最大回撤',
      value: `${trader.maxDrawdown.toFixed(1)}%`,
      isPositive: false,
      isNeutral: true,
    },
    {
      label: '夏普比率',
      value: trader.sharpeRatio.toFixed(2),
      isPositive: trader.sharpeRatio > 1,
      isNeutral: trader.sharpeRatio >= 0 && trader.sharpeRatio <= 1,
    },
    {
      label: '30D 交易数',
      value: trader.trades30d.toLocaleString(),
      isNeutral: true,
    },
    {
      label: '总交易量',
      value: `$${formatPnL(trader.totalVolume)}`,
      isNeutral: true,
    },
  ];

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {trader.label || shortenAddress(trader.address)}
            </h1>
            {trader.twitter && (
              <a
                href={`https://twitter.com/${trader.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-[var(--color-text-tertiary)]">
              {shortenAddress(trader.address)}
            </span>
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
            <a
              href={`https://app.hyperliquid.xyz/explorer/address/${trader.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              title="在浏览器中查看"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            className={`p-4 rounded-xl ${
              stat.highlight 
                ? 'bg-[var(--color-bg-tertiary)]' 
                : 'bg-[var(--color-bg-secondary)]'
            }`}
          >
            <p className="text-xs text-[var(--color-text-muted)] mb-1">{stat.label}</p>
            <p className={`text-lg font-semibold font-mono tabular-nums ${
              stat.isNeutral 
                ? 'text-[var(--color-text-primary)]'
                : stat.isPositive 
                  ? 'text-[var(--color-accent-primary)]' 
                  : 'text-[var(--color-accent-negative)]'
            }`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

