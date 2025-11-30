import type { Trade } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';

interface TradesTableProps {
  trades: Trade[];
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

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TradesTable({ trades }: TradesTableProps) {
  const { t } = useLanguage();
  
  if (trades.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-[var(--color-text-muted)]">
          <svg className="w-10 h-10 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p className="text-sm">{t('detail.noTradeHistory')}</p>
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
              {t('detail.time')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-left">
              {t('detail.pair')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {t('detail.type')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {t('detail.direction')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {t('detail.tradeAmount')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {t('detail.price')}
            </th>
            <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
              {t('detail.realizedPnl')}
            </th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => {
            const isBuy = trade.side === 'buy';
            const isOpen = trade.type === 'open';
            
            return (
              <tr 
                key={index}
                className="border-b border-[var(--color-border)]/50 last:border-b-0 table-row-hover"
              >
                {/* Time */}
                <td className="px-5 py-4">
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    {formatTime(trade.timestamp)}
                  </span>
                </td>

                {/* Symbol */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">
                      {trade.coin}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">PERP</span>
                  </div>
                </td>

                {/* Type */}
                <td className="px-5 py-4 text-right">
                  <span className={`
                    px-2 py-0.5 text-xs rounded
                    ${isOpen 
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]' 
                      : 'bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)]'
                    }
                  `}>
                    {isOpen ? t('detail.openPosition') : t('detail.closePosition')}
                  </span>
                </td>

                {/* Direction */}
                <td className="px-5 py-4 text-right">
                  <span className={`
                    text-xs font-medium
                    ${isBuy 
                      ? 'text-[var(--color-accent-primary)]' 
                      : 'text-[var(--color-accent-negative)]'
                    }
                  `}>
                    {isBuy ? 'LONG' : 'SHORT'}
                  </span>
                </td>

                {/* Size */}
                <td className="px-5 py-4 text-right">
                  <div>
                    <span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">
                      ${formatNumber(trade.size * trade.price)}
                    </span>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">
                      {formatNumber(trade.size, 4)} {trade.coin}
                    </p>
                  </div>
                </td>

                {/* Price */}
                <td className="px-5 py-4 text-right">
                  <span className="font-mono text-sm text-[var(--color-text-secondary)]">
                    ${formatPrice(trade.price)}
                  </span>
                </td>

                {/* Realized PnL */}
                <td className="px-5 py-4 text-right">
                  {trade.realizedPnl !== undefined && trade.realizedPnl !== 0 ? (
                    <span className={`font-mono text-sm ${
                      trade.realizedPnl >= 0 
                        ? 'text-[var(--color-accent-primary)]' 
                        : 'text-[var(--color-accent-negative)]'
                    }`}>
                      {trade.realizedPnl >= 0 ? '+' : ''}${formatNumber(trade.realizedPnl)}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--color-text-muted)]">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

