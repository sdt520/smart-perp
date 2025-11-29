import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CoinSelector } from '../components/CoinSelector';
import { useFlowWebSocket, type FlowEvent } from '../hooks/useFlowWebSocket';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';

// Types
interface TradeEvent {
  id: string;
  timestamp: number;
  address: string;
  label?: string;
  rank: number; // Hyperliquid rank
  pnl30d: number;
  winRate30d: number;
  action: 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'add_long' | 'add_short' | 'reduce_long' | 'reduce_short';
  coin: string;
  size: number; // in USD
  price: number;
  leverage: number;
  positionBefore: number; // in USD
  positionAfter: number; // in USD
  coinWinRate7d?: number;
}

interface TokenOverview {
  netLongShort24h: number; // positive = net long, negative = net short
  topHoldersDirection: 'long' | 'short' | 'neutral';
  topHoldersNetPosition: number;
  volume24h: number;
  tradesCount24h: number;
  uniqueTraders24h: number;
}

// Constants
const TIME_RANGES = [
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '24h', label: '24小时' },
];
const ADDRESS_POOLS = [
  { value: 50, label: 'Top 50' },
  { value: 100, label: 'Top 100' },
  { value: 500, label: 'Top 500' },
];
const MIN_SIZES = [
  { value: 0, label: '全部' },
  { value: 10000, label: '≥ $10K' },
  { value: 50000, label: '≥ $50K' },
  { value: 100000, label: '≥ $100K' },
];
const DIRECTIONS = [
  { value: 'all', label: '全部' },
  { value: 'long', label: '只看多单' },
  { value: 'short', label: '只看空单' },
  { value: 'reversal', label: '只看反转' },
];

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Helper functions
function formatNumber(value: number, decimals = 2): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(decimals)}K`;
  }
  return value.toFixed(decimals);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getActionEmoji(action: TradeEvent['action']): string {
  switch (action) {
    case 'open_long':
    case 'add_long':
      return '🟢';
    case 'open_short':
    case 'add_short':
      return '🔴';
    case 'close_long':
    case 'reduce_long':
      return '📤';
    case 'close_short':
    case 'reduce_short':
      return '📥';
    default:
      return '⚪';
  }
}

function getActionText(action: TradeEvent['action']): string {
  switch (action) {
    case 'open_long': return '开多';
    case 'open_short': return '开空';
    case 'close_long': return '平多';
    case 'close_short': return '平空';
    case 'add_long': return '加多';
    case 'add_short': return '加空';
    case 'reduce_long': return '减多';
    case 'reduce_short': return '减空';
    default: return '交易';
  }
}

function getActionColor(action: TradeEvent['action']): string {
  if (action.includes('long')) {
    return action.includes('close') || action.includes('reduce') 
      ? 'text-[var(--color-accent-primary)]/60' 
      : 'text-[var(--color-accent-primary)]';
  }
  return action.includes('close') || action.includes('reduce')
    ? 'text-[var(--color-accent-negative)]/60'
    : 'text-[var(--color-accent-negative)]';
}

// Filter Select Component
function FilterSelect({ 
  label, 
  value, 
  options, 
  onChange 
}: { 
  label: string; 
  value: string | number; 
  options: { value: string | number; label: string }[]; 
  onChange: (value: string | number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// Token Overview Component
function TokenOverviewCard({ overview, coin }: { overview: TokenOverview | null; coin: string | null }) {
  if (!overview || !coin) {
    return (
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          代币概览
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          请选择一个代币查看概览
        </p>
      </div>
    );
  }

  const isNetLong = overview.netLongShort24h > 0;
  const directionText = overview.topHoldersDirection === 'long' ? '偏多' : overview.topHoldersDirection === 'short' ? '偏空' : '中性';

  return (
    <div className="glass-card rounded-xl p-4">
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
        {coin} 概览 <span className="text-xs text-[var(--color-text-muted)]">(24h)</span>
      </h3>
      
      <div className="space-y-3">
        {/* Net Position */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">聪明钱净头寸</span>
          <span className={`text-sm font-mono font-medium ${isNetLong ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
            {isNetLong ? '净多' : '净空'} ${formatNumber(Math.abs(overview.netLongShort24h))}
          </span>
        </div>

        {/* Direction */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">Top500 持仓方向</span>
          <span className={`text-sm font-medium ${
            overview.topHoldersDirection === 'long' 
              ? 'text-[var(--color-accent-primary)]' 
              : overview.topHoldersDirection === 'short'
                ? 'text-[var(--color-accent-negative)]'
                : 'text-[var(--color-text-secondary)]'
          }`}>
            {directionText} ${formatNumber(Math.abs(overview.topHoldersNetPosition))}
          </span>
        </div>

        {/* Volume */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">聪明钱成交量</span>
          <span className="text-sm font-mono text-[var(--color-text-primary)]">
            ${formatNumber(overview.volume24h)}
          </span>
        </div>

        {/* Trades */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">交易次数 / 人数</span>
          <span className="text-sm font-mono text-[var(--color-text-primary)]">
            {overview.tradesCount24h.toLocaleString()} / {overview.uniqueTraders24h}
          </span>
        </div>
      </div>
    </div>
  );
}

// Trade Event Card Component
function TradeEventCard({ event }: { event: TradeEvent }) {
  const positionChange = event.positionAfter - event.positionBefore;
  const isPositionIncrease = positionChange > 0;

  return (
    <div className="glass-card rounded-xl p-4 hover:bg-[var(--color-bg-secondary)]/80 transition-colors animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--color-text-muted)] font-mono">
          {formatTime(event.timestamp)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]">
            Rank #{event.rank}
          </span>
          <span className={`text-xs ${event.pnl30d >= 0 ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
            30D {event.pnl30d >= 0 ? '+' : ''}{formatCurrency(event.pnl30d)}
          </span>
        </div>
      </div>

      {/* Trader Info */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🧠</span>
        <Link 
          to={`/trader/${event.address}`}
          className="font-mono text-sm text-[var(--color-accent-blue)] hover:underline"
        >
          {event.label || shortenAddress(event.address)}
        </Link>
        <span className="text-xs text-[var(--color-text-muted)]">
          胜率 {event.winRate30d.toFixed(0)}%
        </span>
      </div>

      {/* Action */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg">{getActionEmoji(event.action)}</span>
        <div>
          <span className={`font-medium ${getActionColor(event.action)}`}>
            {getActionText(event.action)}
          </span>
          <span className="text-[var(--color-text-primary)] ml-2">
            {event.coin}-PERP
          </span>
          <span className="text-[var(--color-text-secondary)] ml-2 font-mono">
            ${formatNumber(event.size)}
          </span>
          <span className="text-[var(--color-text-muted)] ml-1">
            @ ${event.price.toLocaleString()}
          </span>
          <span className="text-[var(--color-text-tertiary)] ml-2 text-sm">
            ({event.leverage.toFixed(1)}x)
          </span>
        </div>
      </div>

      {/* Position Change */}
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] pl-8">
        <span>当前 {event.coin} 仓位:</span>
        <span className="font-mono">${formatNumber(Math.abs(event.positionBefore))}</span>
        <span>→</span>
        <span className={`font-mono ${isPositionIncrease ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
          ${formatNumber(Math.abs(event.positionAfter))}
        </span>
        {event.coinWinRate7d !== undefined && (
          <span className="ml-2 text-xs">
            (7D胜率 {event.coinWinRate7d.toFixed(0)}%)
          </span>
        )}
      </div>
    </div>
  );
}

// Main Component
export function TokenFlow() {
  // Auth & Favorites
  const { isAuthenticated } = useAuth();
  const { favorites } = useFavorites();
  
  // Filters
  const [selectedCoin, setSelectedCoin] = useState<string | null>('BTC');
  const [timeRange, setTimeRange] = useState('24h');
  const [addressPool, setAddressPool] = useState(100);
  const [minSize, setMinSize] = useState(0);
  const [direction, setDirection] = useState('all');
  const [addressSource, setAddressSource] = useState<'top500' | 'favorites'>('top500');

  // Data
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [overview, setOverview] = useState<TokenOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for real-time updates
  const { isConnected } = useFlowWebSocket({
    coin: selectedCoin,
    enabled: true,
    onEvent: (event: FlowEvent) => {
      // 转换 WebSocket 事件为 TradeEvent 格式
      // 直接使用后端返回的 oldPositionUsd，不再自己计算
      const tradeEvent: TradeEvent = {
        id: event.id,
        timestamp: event.timestamp,
        address: event.address,
        rank: event.rank,
        pnl30d: event.pnl30d,
        winRate30d: event.winRate30d,
        action: event.action as TradeEvent['action'],
        coin: event.symbol,
        size: event.sizeUsd,
        price: event.price,
        leverage: 1,
        positionBefore: event.oldPositionUsd,
        positionAfter: event.newPositionUsd,
      };
      
      // 过滤：检查是否满足 minSize 和 addressPool/favorites 条件
      if (tradeEvent.size < minSize) return;
      
      // 根据数据来源过滤
      if (addressSource === 'favorites') {
        if (!favorites.has(tradeEvent.address.toLowerCase())) return;
      } else {
        if (tradeEvent.rank > addressPool) return;
      }
      
      // 添加到事件列表顶部
      setEvents(prev => {
        // 避免重复
        if (prev.some(e => e.id === tradeEvent.id)) return prev;
        return [tradeEvent, ...prev].slice(0, 200);
      });
    },
  });

  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (!selectedCoin) {
      setEvents([]);
      setOverview(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate time range
      const now = Date.now();
      let startTime: number;
      switch (timeRange) {
        case '1h':
          startTime = now - 60 * 60 * 1000;
          break;
        case '4h':
          startTime = now - 4 * 60 * 60 * 1000;
          break;
        default:
          startTime = now - 24 * 60 * 60 * 1000;
      }

      // Fetch trade events
      const eventsResponse = await fetch(
        `${API_BASE}/trades/flow?coin=${selectedCoin}&startTime=${startTime}&topN=${addressPool}&minSize=${minSize}`
      );
      
      if (!eventsResponse.ok) {
        throw new Error('Failed to fetch trade events');
      }
      
      const eventsData = await eventsResponse.json();
      if (eventsData.success) {
        setEvents(eventsData.data || []);
      }

      // Fetch overview
      const overviewResponse = await fetch(
        `${API_BASE}/trades/overview?coin=${selectedCoin}&topN=${addressPool}`
      );
      
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        if (overviewData.success) {
          setOverview(overviewData.data);
        }
      }
    } catch (err) {
      console.error('Error fetching token flow data:', err);
      setError('加载数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedCoin, timeRange, addressPool, minSize]);

  useEffect(() => {
    fetchData();
    
    // Auto refresh overview every 60 seconds (events come via WebSocket)
    const interval = setInterval(() => {
      // Only refresh overview, not events
      if (selectedCoin) {
        fetch(`${API_BASE}/trades/overview?coin=${selectedCoin}&topN=${addressPool}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) setOverview(data.data);
          })
          .catch(console.error);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, selectedCoin, addressPool]);

  // Clear events when address source changes
  useEffect(() => {
    setEvents([]);
  }, [addressSource]);

  // Filter events by direction and address source
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Filter by address source
      if (addressSource === 'favorites') {
        if (!favorites.has(event.address.toLowerCase())) return false;
      } else {
        if (event.rank > addressPool) return false;
      }
      
      // Filter by direction
      if (direction === 'long' && !event.action.includes('long')) return false;
      if (direction === 'short' && !event.action.includes('short')) return false;
      if (direction === 'reversal') {
        if (!event.action.includes('close')) return false;
      }
      return true;
    });
  }, [events, direction, addressSource, favorites, addressPool]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            聪明钱交易流
            <span className="text-[var(--color-text-tertiary)] font-normal ml-2">Smart Money Flow</span>
          </h1>
          {/* WebSocket 状态指示器 */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
            isConnected 
              ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]' 
              : 'bg-[var(--color-accent-negative)]/10 text-[var(--color-accent-negative)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[var(--color-accent-primary)] animate-pulse' : 'bg-[var(--color-accent-negative)]'}`} />
            {isConnected ? '实时连接' : '连接中...'}
          </div>
        </div>
        <p className="text-[var(--color-text-muted)]">
          实时追踪顶级交易者在各代币上的交易动态
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-6">
          {/* Coin Selector */}
          <div className="glass-card rounded-xl p-4 overflow-visible">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">选择代币</h3>
            <div className="relative z-50">
              <CoinSelector 
                selectedCoin={selectedCoin} 
                onSelectCoin={(coin) => setSelectedCoin(coin || 'BTC')} 
              />
            </div>
          </div>

          {/* Data Source Selection */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">数据来源</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="addressSource"
                  checked={addressSource === 'top500'}
                  onChange={() => setAddressSource('top500')}
                  className="w-4 h-4 accent-[var(--color-accent-primary)]"
                />
                <span className={`text-sm ${addressSource === 'top500' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'} group-hover:text-[var(--color-text-primary)] transition-colors`}>
                  Top 500 聪明钱
                </span>
              </label>
              <label className={`flex items-center gap-3 ${isAuthenticated ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} group`}>
                <input
                  type="radio"
                  name="addressSource"
                  checked={addressSource === 'favorites'}
                  onChange={() => isAuthenticated && setAddressSource('favorites')}
                  disabled={!isAuthenticated}
                  className="w-4 h-4 accent-[var(--color-accent-primary)]"
                />
                <span className={`text-sm ${addressSource === 'favorites' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'} ${isAuthenticated ? 'group-hover:text-[var(--color-text-primary)]' : ''} transition-colors`}>
                  我的收藏
                  {!isAuthenticated && <span className="text-xs ml-1">(需登录)</span>}
                  {isAuthenticated && favorites.size > 0 && <span className="text-xs ml-1 text-[var(--color-text-muted)]">({favorites.size})</span>}
                </span>
              </label>
            </div>
          </div>

          {/* Filters */}
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">筛选条件</h3>
            
            <FilterSelect
              label="时间范围"
              value={timeRange}
              options={TIME_RANGES}
              onChange={(v) => setTimeRange(v as string)}
            />
            
            {addressSource === 'top500' && (
              <FilterSelect
                label="地址池"
                value={addressPool}
                options={ADDRESS_POOLS}
                onChange={(v) => setAddressPool(Number(v))}
              />
            )}
            
            <FilterSelect
              label="最小仓位"
              value={minSize}
              options={MIN_SIZES}
              onChange={(v) => setMinSize(Number(v))}
            />
            
            <FilterSelect
              label="方向"
              value={direction}
              options={DIRECTIONS}
              onChange={(v) => setDirection(v as string)}
            />
          </div>

          {/* Token Overview */}
          <TokenOverviewCard overview={overview} coin={selectedCoin} />
        </div>

        {/* Main Content - Event Feed */}
        <div className="flex-1 min-w-0">
          <div className="glass-card rounded-xl">
            {/* Feed Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  实时交易流
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {filteredEvents.length} 条记录
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)] animate-pulse"></div>
                    <span className="text-xs text-[var(--color-text-muted)]">实时推送中</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent-negative)]"></div>
                    <span className="text-xs text-[var(--color-text-muted)]">连接中...</span>
                  </>
                )}
              </div>
            </div>

            {/* Event List */}
            <div className="p-4 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
              {loading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
                    <div className="flex justify-between mb-3">
                      <div className="h-4 w-20 bg-[var(--color-bg-tertiary)] rounded"></div>
                      <div className="h-4 w-32 bg-[var(--color-bg-tertiary)] rounded"></div>
                    </div>
                    <div className="h-4 w-48 bg-[var(--color-bg-tertiary)] rounded mb-3"></div>
                    <div className="h-4 w-full bg-[var(--color-bg-tertiary)] rounded"></div>
                  </div>
                ))
              ) : error ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <p>{error}</p>
                  <button
                    onClick={fetchData}
                    className="mt-4 px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg text-sm hover:bg-[var(--color-bg-tertiary)]/80 transition-colors"
                  >
                    重试
                  </button>
                </div>
              ) : !selectedCoin ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <p>请选择一个代币查看交易流</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <p>暂无符合条件的交易记录</p>
                  <p className="text-xs mt-1">尝试调整筛选条件</p>
                </div>
              ) : (
                filteredEvents.map(event => (
                  <TradeEventCard key={event.id} event={event} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
