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
  const totalTrades = wallets.reduce((sum, w) => sum + w.trades30d, 0);

  const formatLargeNumber = (num: number): string => {
    if (Math.abs(num) >= 1000000) {
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
      color: totalPnL30d >= 0 ? 'green' : 'red',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5l-5-3-5 3M17 19l-5 3-5-3" />
        </svg>
      ),
    },
    {
      title: '平均胜率',
      value: `${avgWinRate.toFixed(1)}%`,
      subtitle: '30天平均',
      color: avgWinRate >= 60 ? 'green' : avgWinRate >= 50 ? 'blue' : 'red',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      title: 'Top 交易者',
      value: topPerformer ? `$${formatLargeNumber(topPerformer.pnl30d)}` : '-',
      subtitle: topPerformer?.twitter ? `@${topPerformer.twitter}` : topPerformer?.address.slice(0, 10) + '...',
      color: 'blue',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      title: '总交易数',
      value: formatLargeNumber(totalTrades),
      subtitle: '30天内',
      color: 'blue',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-4-4-3 3" />
        </svg>
      ),
    },
  ];

  const colorClasses = {
    green: {
      bg: 'from-[var(--color-accent-green)]/10 to-transparent',
      text: 'text-[var(--color-accent-green)]',
      border: 'border-[var(--color-accent-green)]/20',
      glow: 'glow-green',
    },
    red: {
      bg: 'from-[var(--color-accent-red)]/10 to-transparent',
      text: 'text-[var(--color-accent-red)]',
      border: 'border-[var(--color-accent-red)]/20',
      glow: 'glow-red',
    },
    blue: {
      bg: 'from-[var(--color-accent-blue)]/10 to-transparent',
      text: 'text-[var(--color-accent-blue)]',
      border: 'border-[var(--color-accent-blue)]/20',
      glow: 'glow-blue',
    },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const colors = colorClasses[card.color as keyof typeof colorClasses];
        return (
          <div
            key={index}
            className={`
              relative overflow-hidden rounded-2xl
              bg-gradient-to-br ${colors.bg}
              border ${colors.border}
              p-5 transition-all duration-300
              hover:scale-[1.02] hover:${colors.glow}
            `}
          >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
              <svg viewBox="0 0 100 100" fill="currentColor">
                <circle cx="80" cy="20" r="60" />
              </svg>
            </div>

            <div className="relative">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-[var(--color-text-muted)]">
                  {card.title}
                </p>
                <div className={colors.text}>{card.icon}</div>
              </div>
              <p className={`text-3xl font-bold font-mono tabular-nums ${colors.text}`}>
                {card.value}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {card.subtitle}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}


