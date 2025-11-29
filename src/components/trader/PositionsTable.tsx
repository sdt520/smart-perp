import { useState, useMemo } from 'react';
import type { Position } from '../../services/api';

interface PositionsTableProps {
  positions: Position[];
  title: string;
  showPnl?: boolean;
}

type SortField = 'positionValue' | 'unrealizedPnl' | 'coin';
type SortDirection = 'asc' | 'desc';

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

// Sort icon component
function SortIcon({ field, currentField, direction }: { 
  field: SortField; 
  currentField: SortField | null; 
  direction: SortDirection 
}) {
  const isActive = field === currentField;
  return (
    <svg 
      className={`w-3 h-3 ml-1 inline-block transition-colors ${
        isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)] opacity-40'
      }`}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
    >
      {isActive && direction === 'asc' ? (
        <path d="M12 19V5M5 12l7-7 7 7" />
      ) : (
        <path d="M12 5v14M5 12l7 7 7-7" />
      )}
    </svg>
  );
}

export function PositionsTable({ positions, title, showPnl = false }: PositionsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField | null>('positionValue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or clear sort
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filter and sort positions
  const filteredAndSortedPositions = useMemo(() => {
    let result = [...positions];
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.coin.toLowerCase().includes(query));
    }
    
    // Sort
    if (sortField) {
      result.sort((a, b) => {
        let aValue: number | string;
        let bValue: number | string;
        
        switch (sortField) {
          case 'positionValue':
            aValue = a.positionValue || Math.abs(a.size) * a.markPrice;
            bValue = b.positionValue || Math.abs(b.size) * b.markPrice;
            break;
          case 'unrealizedPnl':
            aValue = a.unrealizedPnl;
            bValue = b.unrealizedPnl;
            break;
          case 'coin':
            aValue = a.coin;
            bValue = b.coin;
            break;
          default:
            return 0;
        }
        
        if (typeof aValue === 'string') {
          return sortDirection === 'asc' 
            ? aValue.localeCompare(bValue as string)
            : (bValue as string).localeCompare(aValue);
        }
        
        return sortDirection === 'asc' ? aValue - (bValue as number) : (bValue as number) - aValue;
      });
    }
    
    return result;
  }, [positions, searchQuery, sortField, sortDirection]);

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
    <div>
      {/* Search and filters */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--color-border)]">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="搜索代币..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-all focus:outline-none focus:border-[var(--color-accent-primary)]/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Result count */}
        <span className="text-xs text-[var(--color-text-muted)]">
          {filteredAndSortedPositions.length} / {positions.length} 个持仓
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th 
                className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-left cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors"
                onClick={() => handleSort('coin')}
              >
                交易对
                <SortIcon field="coin" currentField={sortField} direction={sortDirection} />
              </th>
              <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
                方向
              </th>
              <th 
                className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors"
                onClick={() => handleSort('positionValue')}
              >
                仓位价值
                <SortIcon field="positionValue" currentField={sortField} direction={sortDirection} />
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
              <th 
                className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors"
                onClick={() => handleSort('unrealizedPnl')}
              >
                未实现 PnL
                <SortIcon field="unrealizedPnl" currentField={sortField} direction={sortDirection} />
              </th>
              {showPnl && (
                <th className="px-5 py-4 text-xs font-medium text-[var(--color-text-muted)] text-right">
                  已实现 PnL
                </th>
              )}
            </tr>
          </thead>
        <tbody>
          {filteredAndSortedPositions.length === 0 ? (
            <tr>
              <td colSpan={showPnl ? 8 : 7} className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">
                未找到匹配的代币
              </td>
            </tr>
          ) : filteredAndSortedPositions.map((position, index) => {
            const isLong = position.side === 'long';
            const pnlPercent = position.entryPrice > 0 
              ? ((position.markPrice - position.entryPrice) / position.entryPrice) * 100 * (isLong ? 1 : -1)
              : 0;
            
            return (
              <tr 
                key={`${position.coin}-${index}`}
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

