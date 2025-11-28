import type { Position } from '../../services/api';

interface PositionsTableProps {
  positions: Position[];
  title: string;
  showPnl?: boolean;
}

function formatNumber(value: number, decimals = 2): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(decimals);
}

function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return value.toFixed(value < 1 ? 6 : 2);
}

export function PositionsTable({ positions, title, showPnl = false }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-[var(--color-text-muted)]">
          <svg className="w-10 h-10 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <p className="text-sm">暂无{title}数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-left">
              交易对
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              方向
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              仓位价值
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              入场价
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {showPnl ? '平仓价' : '当前价'}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              杠杆
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              未实现 PnL
            </th>
            {showPnl && (
              <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
                已实现 PnL
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {positions.map((position, index) => {
            const isLong = position.side === 'long';
            const pnlPercent = position.entryPrice > 0 
              ? ((position.markPrice - position.entryPrice) / position.entryPrice) * 100 * (isLong ? 1 : -1)
              : 0;
            
            return (
              <tr 
                key={index}
                className="border-b border-[var(--color-border)]/50 last:border-b-0 table-row-hover"
              >
                {/* Symbol */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">
                      {position.coin}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">PERP</span>
                  </div>
                </td>

                {/* Direction */}
                <td className="px-5 py-4 text-right">
                  <span className={`
                    px-2 py-0.5 text-xs rounded font-medium
                    ${isLong 
                      ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]' 
                      : 'bg-[var(--color-accent-negative)]/10 text-[var(--color-accent-negative)]'
                    }
                  `}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>

                {/* Size */}
                <td className="px-5 py-4 text-right">
                  <div>
                    <span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">
                      ${formatNumber(position.positionValue || Math.abs(position.size) * position.markPrice)}
                    </span>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">
                      {formatNumber(Math.abs(position.size), 4)} {position.coin}
                    </p>
                  </div>
                </td>

                {/* Entry Price */}
                <td className="px-5 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-secondary)]">
                    ${formatPrice(position.entryPrice)}
                  </span>
                </td>

                {/* Mark Price */}
                <td className="px-5 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-secondary)]">
                    ${formatPrice(position.markPrice)}
                  </span>
                </td>

                {/* Leverage */}
                <td className="px-5 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)]">
                    {position.leverage}x
                  </span>
                </td>

                {/* Unrealized PnL */}
                <td className="px-5 py-4 text-right">
                  <div>
                    <span className={`font-mono text-sm ${
                      position.unrealizedPnl >= 0 
                        ? 'text-[var(--color-accent-primary)]' 
                        : 'text-[var(--color-accent-negative)]'
                    }`}>
                      {position.unrealizedPnl >= 0 ? '+' : ''}${formatNumber(position.unrealizedPnl)}
                    </span>
                    <p className={`text-xs ${
                      pnlPercent >= 0 
                        ? 'text-[var(--color-accent-primary)]' 
                        : 'text-[var(--color-accent-negative)]'
                    }`}>
                      {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </td>

                {/* Realized PnL (for closed positions) */}
                {showPnl && (
                  <td className="px-5 py-4 text-right">
                    <span className={`font-mono text-sm ${
                      (position.realizedPnl || 0) >= 0 
                        ? 'text-[var(--color-accent-primary)]' 
                        : 'text-[var(--color-accent-negative)]'
                    }`}>
                      {(position.realizedPnl || 0) >= 0 ? '+' : ''}${formatNumber(position.realizedPnl || 0)}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

