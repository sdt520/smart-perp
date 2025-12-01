import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CoinSelector } from '../components/CoinSelector';
import { useFlowWebSocket, type FlowEvent } from '../hooks/useFlowWebSocket';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useLanguage } from '../contexts/LanguageContext';

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

interface NetFlowPeriod {
  netFlow: number;
  volume: number;
  trades: number;
  traders: number;
}

interface NetFlowData {
  '5m': NetFlowPeriod;
  '30m': NetFlowPeriod;
  '1h': NetFlowPeriod;
  '4h': NetFlowPeriod;
  '8h': NetFlowPeriod;
  '12h': NetFlowPeriod;
  '24h': NetFlowPeriod;
}

// Constants - these will be translated inside the component
const ADDRESS_POOLS = [
  { value: 50, label: 'Top 50' },
  { value: 100, label: 'Top 100' },
  { value: 500, label: 'Top 500' },
];

// Helper to get translated options
function getTimeRanges(t: (key: string) => string) {
  return [
    { value: '1h', label: t('flow.1hour') },
    { value: '4h', label: t('flow.4hours') },
    { value: '24h', label: t('flow.24hours') },
  ];
}
function getMinSizes(t: (key: string) => string) {
  return [
    { value: 0, label: t('flow.all') },
    { value: 10000, label: '≥ $10K' },
    { value: 50000, label: '≥ $50K' },
    { value: 100000, label: '≥ $100K' },
  ];
}
function getDirections(t: (key: string) => string) {
  return [
    { value: 'all', label: t('flow.all') },
    { value: 'long', label: t('flow.longOnly') },
    { value: 'short', label: t('flow.shortOnly') },
    { value: 'reversal', label: t('flow.reversalOnly') },
  ];
}

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

function getActionText(action: TradeEvent['action'], t: (key: string) => string): string {
  switch (action) {
    case 'open_long': return t('action.openLong');
    case 'open_short': return t('action.openShort');
    case 'close_long': return t('action.closeLong');
    case 'close_short': return t('action.closeShort');
    case 'add_long': return t('action.addLong');
    case 'add_short': return t('action.addShort');
    case 'reduce_long': return t('action.reduceLong');
    case 'reduce_short': return t('action.reduceShort');
    default: return action;
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

// Time Frame Net Flow Component
const TIME_PERIODS = ['5m', '30m', '1h', '4h', '8h', '12h', '24h'] as const;
const PERIOD_LABELS: Record<string, string> = {
  '5m': '5分钟',
  '30m': '30分钟',
  '1h': '1小时',
  '4h': '4小时',
  '8h': '8小时',
  '12h': '12小时',
  '24h': '24小时',
};

function TimeFrameNetFlow({ 
  netFlowData, 
  coin,
  selectedPeriod,
  onSelectPeriod 
}: { 
  netFlowData: NetFlowData | null;
  coin: string | null;
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
}) {
  const { t } = useLanguage();
  
  if (!coin) {
    return (
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          {t('flow.netFlowOverview')}
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('flow.selectCoin')}
        </p>
      </div>
    );
  }
  
  const currentData = netFlowData?.[selectedPeriod as keyof NetFlowData];
  const isNetLong = currentData && currentData.netFlow > 0;
  
  return (
    <div className="glass-card rounded-xl p-4">
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
        {coin} {t('flow.netFlowOverview')}
      </h3>
      
      {/* Time Period Selector */}
      <div className="flex flex-wrap gap-1 mb-4">
        {TIME_PERIODS.map(period => (
          <button
            key={period}
            onClick={() => onSelectPeriod(period)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              selectedPeriod === period
                ? 'bg-[var(--color-accent-primary)] text-white'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {period}
          </button>
        ))}
      </div>
      
      {!netFlowData ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-[var(--color-bg-tertiary)] rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Net Flow */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">{t('flow.netFlow')}</span>
            <span className={`text-sm font-mono font-medium ${
              isNetLong ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'
            }`}>
              {isNetLong ? '↑ ' : '↓ '}
              {isNetLong ? t('flow.netLong') : t('flow.netShort')} ${formatNumber(Math.abs(currentData?.netFlow || 0))}
            </span>
          </div>
          
          {/* Volume */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">{t('flow.volume')}</span>
            <span className="text-sm font-mono text-[var(--color-text-primary)]">
              ${formatNumber(currentData?.volume || 0)}
            </span>
          </div>
          
          {/* Trades */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">{t('flow.tradesCount')}</span>
            <span className="text-sm font-mono text-[var(--color-text-primary)]">
              {currentData?.trades || 0} / {currentData?.traders || 0} {t('flow.traders')}
            </span>
          </div>
          
          {/* Mini Bar Chart showing all periods */}
          <div className="pt-3 border-t border-[var(--color-border)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-2">{t('flow.allPeriods')}</div>
            <div className="space-y-1.5">
              {TIME_PERIODS.map(period => {
                const data = netFlowData[period];
                const maxAbs = Math.max(
                  ...TIME_PERIODS.map(p => Math.abs(netFlowData[p]?.netFlow || 0))
                ) || 1;
                const percentage = (Math.abs(data?.netFlow || 0) / maxAbs) * 100;
                const isPositive = (data?.netFlow || 0) >= 0;
                
                return (
                  <div 
                    key={period}
                    className={`flex items-center gap-2 cursor-pointer hover:bg-[var(--color-bg-tertiary)]/50 rounded px-1 py-0.5 transition-colors ${
                      selectedPeriod === period ? 'bg-[var(--color-bg-tertiary)]' : ''
                    }`}
                    onClick={() => onSelectPeriod(period)}
                  >
                    <span className="text-[10px] text-[var(--color-text-muted)] w-8">{period}</span>
                    <div className="flex-1 h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          isPositive ? 'bg-[var(--color-accent-primary)]' : 'bg-[var(--color-accent-negative)]'
                        }`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono w-14 text-right ${
                      isPositive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'
                    }`}>
                      {isPositive ? '+' : ''}{formatNumber(data?.netFlow || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Token Overview Component
function TokenOverviewCard({ overview, coin }: { overview: TokenOverview | null; coin: string | null }) {
  const { t } = useLanguage();
  
  if (!overview || !coin) {
    return (
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          {t('flow.tokenOverview')}
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('flow.selectCoin')}
        </p>
      </div>
    );
  }

  const isNetLong = overview.netLongShort24h > 0;
  const directionText = overview.topHoldersDirection === 'long' 
    ? t('flow.biasLong') 
    : overview.topHoldersDirection === 'short' 
      ? t('flow.biasShort') 
      : t('flow.neutral');

  return (
    <div className="glass-card rounded-xl p-4">
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
        {coin} {t('flow.overview')} <span className="text-xs text-[var(--color-text-muted)]">(24h)</span>
      </h3>
      
      <div className="space-y-3">
        {/* Net Position */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">{t('flow.smartMoneyNetPosition')}</span>
          <span className={`text-sm font-mono font-medium ${isNetLong ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
            {isNetLong ? t('flow.netLong') : t('flow.netShort')} ${formatNumber(Math.abs(overview.netLongShort24h))}
          </span>
        </div>

        {/* Direction */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">{t('flow.positionDirection')}</span>
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
          <span className="text-xs text-[var(--color-text-muted)]">{t('flow.smartMoneyVolume')}</span>
          <span className="text-sm font-mono text-[var(--color-text-primary)]">
            ${formatNumber(overview.volume24h)}
          </span>
        </div>

        {/* Trades */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">{t('flow.tradesCount')}</span>
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
  const { t } = useLanguage();
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
          {t('flow.winRate')} {event.winRate30d.toFixed(0)}%
        </span>
      </div>

      {/* Action */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg">{getActionEmoji(event.action)}</span>
        <div>
          <span className={`font-medium ${getActionColor(event.action)}`}>
            {getActionText(event.action, t)}
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
        <span>{t('flow.currentPosition')} {event.coin}:</span>
        <span className="font-mono">${formatNumber(Math.abs(event.positionBefore))}</span>
        <span>→</span>
        <span className={`font-mono ${isPositionIncrease ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'}`}>
          ${formatNumber(Math.abs(event.positionAfter))}
        </span>
        {event.coinWinRate7d !== undefined && (
          <span className="ml-2 text-xs">
            (7D {t('flow.winRate')} {event.coinWinRate7d.toFixed(0)}%)
          </span>
        )}
      </div>
    </div>
  );
}

// Main Component
export function TokenFlow() {
  // Language
  const { t } = useLanguage();
  
  // Translated options
  const TIME_RANGES = useMemo(() => getTimeRanges(t), [t]);
  const MIN_SIZES = useMemo(() => getMinSizes(t), [t]);
  const DIRECTIONS = useMemo(() => getDirections(t), [t]);
  
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
  const [netFlowData, setNetFlowData] = useState<NetFlowData | null>(null);
  const [selectedFlowPeriod, setSelectedFlowPeriod] = useState('1h');
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
      
      // Fetch net flow data for all time periods
      const netFlowResponse = await fetch(
        `${API_BASE}/trades/net-flow?coin=${selectedCoin}&topN=${addressPool}`
      );
      
      if (netFlowResponse.ok) {
        const netFlowResult = await netFlowResponse.json();
        if (netFlowResult.success) {
          setNetFlowData(netFlowResult.data);
        }
      }
    } catch (err) {
      console.error('Error fetching token flow data:', err);
      setError(t('flow.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedCoin, timeRange, addressPool, minSize]);

  useEffect(() => {
    fetchData();
    
    // Auto refresh overview and net flow every 30 seconds (events come via WebSocket)
    const interval = setInterval(() => {
      // Only refresh overview and net flow, not events
      if (selectedCoin) {
        fetch(`${API_BASE}/trades/overview?coin=${selectedCoin}&topN=${addressPool}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) setOverview(data.data);
          })
          .catch(console.error);
        
        fetch(`${API_BASE}/trades/net-flow?coin=${selectedCoin}&topN=${addressPool}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) setNetFlowData(data.data);
          })
          .catch(console.error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, selectedCoin, addressPool]);

  // Clear events and refetch when address source changes
  useEffect(() => {
    setEvents([]);
    fetchData();
  }, [addressSource, fetchData]);

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
            {t('flow.title')}
          </h1>
          {/* WebSocket 状态指示器 */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
            isConnected 
              ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]' 
              : 'bg-[var(--color-accent-negative)]/10 text-[var(--color-accent-negative)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[var(--color-accent-primary)] animate-pulse' : 'bg-[var(--color-accent-negative)]'}`} />
            {isConnected ? t('flow.realtime') : t('flow.connecting')}
          </div>
        </div>
        <p className="text-[var(--color-text-muted)]">
          {t('flow.description')}
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-6">
          {/* Coin Selector */}
          <div className="glass-card rounded-xl p-4 overflow-visible">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">{t('home.filterCoin')}</h3>
            <div className="relative z-50">
              <CoinSelector 
                selectedCoin={selectedCoin} 
                onSelectCoin={(coin) => setSelectedCoin(coin || 'BTC')} 
              />
            </div>
          </div>

          {/* Data Source Selection */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">{t('flow.dataSource')}</h3>
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
                  {t('flow.topSmartMoney')}
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
                  {t('flow.myFavorites')}
                  {!isAuthenticated && <span className="text-xs ml-1">{t('flow.needLogin')}</span>}
                  {isAuthenticated && favorites.size > 0 && <span className="text-xs ml-1 text-[var(--color-text-muted)]">({favorites.size})</span>}
                </span>
              </label>
            </div>
          </div>

          {/* Filters */}
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">{t('flow.filters')}</h3>
            
            <FilterSelect
              label={t('flow.timeRange')}
              value={timeRange}
              options={TIME_RANGES}
              onChange={(v) => setTimeRange(v as string)}
            />
            
            {addressSource === 'top500' && (
              <FilterSelect
                label={t('flow.addressPool')}
                value={addressPool}
                options={ADDRESS_POOLS}
                onChange={(v) => setAddressPool(Number(v))}
              />
            )}
            
            <FilterSelect
              label={t('flow.minPosition')}
              value={minSize}
              options={MIN_SIZES}
              onChange={(v) => setMinSize(Number(v))}
            />
            
            <FilterSelect
              label={t('flow.direction')}
              value={direction}
              options={DIRECTIONS}
              onChange={(v) => setDirection(v as string)}
            />
          </div>

          {/* Time Frame Net Flow */}
          <TimeFrameNetFlow 
            netFlowData={netFlowData} 
            coin={selectedCoin}
            selectedPeriod={selectedFlowPeriod}
            onSelectPeriod={setSelectedFlowPeriod}
          />

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
                  {t('flow.realtimeFeed')}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {filteredEvents.length} {t('home.records')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)] animate-pulse"></div>
                    <span className="text-xs text-[var(--color-text-muted)]">{t('flow.realtimePush')}</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent-negative)]"></div>
                    <span className="text-xs text-[var(--color-text-muted)]">{t('flow.connecting')}...</span>
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
                    {t('flow.retry')}
                  </button>
                </div>
              ) : !selectedCoin ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <p>{t('flow.selectCoin')}</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <p>{t('flow.noMatchingTrades')}</p>
                  <p className="text-xs mt-1">{t('flow.adjustFilters')}</p>
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
