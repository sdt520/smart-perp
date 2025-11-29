import type { SmartWallet } from '../types';

interface StatsCardsProps {
  wallets: SmartWallet[];
}

export function StatsCards({ wallets }: StatsCardsProps) {
  // Calculate aggregate stats
  const totalPnL30d = wallets.reduce((sum, w) => sum + w.pnl30d, 0);
  const avgWinRate = wallets.length > 0
    ? wallets.reduce((sum, w) => sum + w.winRate30d, 0) / wallets.length
    : 0;
  const topPerformer = wallets.length > 0
    ? wallets.reduce((top, w) => (w.pnl30d > top.pnl30d ? w : top), wallets[0])
    : null;
  const totalVolume = wallets.reduce((sum, w) => sum + w.volume30d, 0);

  const formatLargeNumber = (num: number): string => {
    if (Math.abs(num) >= 1000000000) {
      return `${(num / 1000000000).toFixed(2)}B`;
    } else if (Math.abs(num) >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (Math.abs(num) >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  };

  const cards = [
    {
      title: '30D 总 PnL',
      value: `$${formatLargeNumber(totalPnL30d)}`,
      subtitle: '所有跟踪钱包',
      isPositive: totalPnL30d >= 0,
    },
    {
      title: '平均胜率',
      value: `${avgWinRate.toFixed(1)}%`,
      subtitle: '30天平均',
      isPositive: avgWinRate >= 50,
    },
    {
      title: 'Top 交易者',
      value: topPerformer ? `$${formatLargeNumber(topPerformer.pnl30d)}` : '-',
      subtitle: topPerformer?.twitter ? `@${topPerformer.twitter}` : topPerformer?.address.slice(0, 10) + '...',
      isPositive: true,
    },
    {
      title: '30天成交量',
      value: `$${formatLargeNumber(totalVolume)}`,
      subtitle: '所有跟踪钱包',
      isPositive: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="glass-card rounded-2xl p-6 transition-all duration-200 hover:bg-white/[0.03] animate-fade-in"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <p className="text-sm text-[var(--color-text-tertiary)] mb-2">
            {card.title}
          </p>
          <p className={`text-2xl font-semibold font-mono tabular-nums ${
            card.title === '30D 总 PnL' 
              ? card.isPositive 
                ? 'text-[var(--color-accent-primary)]' 
                : 'text-[var(--color-accent-negative)]'
              : 'text-[var(--color-text-primary)]'
          }`}>
            {card.value}
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
}
