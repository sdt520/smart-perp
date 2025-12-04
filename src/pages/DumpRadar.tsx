import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Telegram Types
interface TelegramStatus {
  bound: boolean;
  verified: boolean;
  username?: string;
  notificationsEnabled: boolean;
}

interface NotificationSettings {
  notificationsEnabled: boolean;
  watchAllTokens: boolean;
  tokens: string[];
  thresholdUsd: number;
}

// Types
interface BlockchainNetwork {
  id: string;
  name: string;
  chain_id: number | null;
  explorer_url: string | null;
  is_enabled: boolean;
}

interface BinanceToken {
  symbol: string;
  name: string;
}

interface DumpRadarEvent {
  id: number;
  token_id: number;
  network_id: string;
  tx_hash: string;
  from_address: string;
  to_address: string;
  to_binance_label: string | null;
  amount_formatted: number | null;
  amount_usd: number | null;
  from_label: string | null;
  from_tag: string | null;
  tx_timestamp: string;
  token_symbol?: string;
  token_name?: string;
  network_name?: string;
  explorer_url?: string;
}


// Helper functions
function formatNumber(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000000) return `${(value / 1000000000).toFixed(2)}B`;
  if (absValue >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (absValue >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(2);
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getFromTagEmoji(tag: string | null): string {
  switch (tag) {
    case 'project_team': return '🏢';
    case 'fund': return '🏦';
    case 'whale': return '🐋';
    default: return '❓';
  }
}

function getFromTagLabel(tag: string | null, t: (key: string) => string): string {
  switch (tag) {
    case 'project_team': return t('dumpRadar.projectTeam');
    case 'fund': return t('dumpRadar.fund');
    case 'whale': return t('dumpRadar.whale');
    default: return t('dumpRadar.unknown');
  }
}

// Token Selector Component - 从币安获取代币列表
function TokenSelector({ 
  tokens,
  selectedTokens,
  onToggle,
  onSelectAll,
  onRemove,
  searchQuery,
  onSearchChange,
  t,
}: {
  tokens: BinanceToken[];
  selectedTokens: Set<string>;
  onToggle: (symbol: string) => void;
  onSelectAll: () => void;
  onRemove: (symbol: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  t: (key: string) => string;
}) {
  // 搜索结果：只在有搜索词时显示
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return tokens.filter(t => 
      t.symbol.toLowerCase().includes(query) &&
      !selectedTokens.has(t.symbol) // 排除已选择的
    ).slice(0, 10);
  }, [tokens, searchQuery, selectedTokens]);

  const isAllSelected = selectedTokens.size === 0; // 空集合表示"全部"

  return (
    <div className="space-y-3">
      {/* 全部代币按钮 */}
      <button
        onClick={onSelectAll}
        className={`w-full px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
          isAllSelected
            ? 'bg-[var(--color-accent-primary)] text-white'
            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <span>{t('dumpRadar.allTokens')}</span>
        {isAllSelected && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
        )}
      </button>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('dumpRadar.searchToken')}
          className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        
        {/* 搜索结果下拉 */}
        {searchResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map(token => (
              <button
                key={token.symbol}
                onClick={() => {
                  onToggle(token.symbol);
                  onSearchChange(''); // 清空搜索
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] flex items-center justify-between"
              >
                <span className="font-medium">${token.symbol}</span>
                <span className="text-xs text-[var(--color-text-muted)]">+ {t('dumpRadar.addToken')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 已选代币列表（只在有选择时显示） */}
      {!isAllSelected && selectedTokens.size > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-[var(--color-text-muted)]">
            {t('dumpRadar.selectedCount')}: {selectedTokens.size}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedTokens).filter(s => s !== '__none__').map(symbol => (
              <span
                key={symbol}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/30"
              >
                ${symbol}
                <button
                  onClick={() => onRemove(symbol)}
                  className="hover:text-[var(--color-accent-negative)] transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Event Card Component
function EventCard({ event, t }: { event: DumpRadarEvent; t: (key: string) => string }) {
  const explorerUrl = event.explorer_url || 'https://etherscan.io';
  const txLink = `${explorerUrl}/tx/${event.tx_hash}`;
  const fromLink = `${explorerUrl}/address/${event.from_address}`;
  
  return (
    <div className="glass-card rounded-xl p-4 hover:bg-[var(--color-bg-secondary)]/80 transition-colors animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <span className="font-medium text-[var(--color-text-primary)]">
            ${event.token_symbol}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
            {event.network_name}
          </span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)] font-mono">
          {formatTime(event.tx_timestamp)}
        </span>
      </div>
      
      {/* Amount */}
      <div className="mb-3">
        <span className="text-2xl font-bold text-[var(--color-accent-negative)]">
          ${formatNumber(event.amount_usd || 0)}
        </span>
        <span className="text-sm text-[var(--color-text-muted)] ml-2">
          ({formatNumber(event.amount_formatted || 0)} {event.token_symbol})
        </span>
      </div>
      
      {/* From/To */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">{t('dumpRadar.from')}:</span>
          <a 
            href={fromLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[var(--color-accent-blue)] hover:underline"
          >
            {shortenAddress(event.from_address)}
          </a>
          {event.from_label && (
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-accent-negative)]/10 text-[var(--color-accent-negative)]">
              {event.from_label}
            </span>
          )}
          <span className="text-lg">{getFromTagEmoji(event.from_tag)}</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {getFromTagLabel(event.from_tag, t)}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">{t('dumpRadar.to')}:</span>
          <span className="font-medium text-[var(--color-text-primary)]">
            {event.to_binance_label || 'Binance'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
            CEX
          </span>
        </div>
      </div>
      
      {/* Link */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        <a
          href={txLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-accent-blue)] hover:underline flex items-center gap-1"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
          {t('dumpRadar.viewTx')}
        </a>
      </div>
    </div>
  );
}

// Token Stats Card - 显示选中币种的时间段统计（跨所有链）
interface TokenStatsData {
  total: { count: number; usd: number };
  byChain: Record<string, { count: number; usd: number }>;
}

function TokenStatsCard({ selectedTokens, t }: { selectedTokens: string[]; t: (key: string) => string }) {
  const [stats, setStats] = useState<Record<string, Record<string, TokenStatsData>>>({});
  const [loading, setLoading] = useState(false);

  const timeRanges = [
    { key: '5m', label: '5m', minutes: 5 },
    { key: '1h', label: '1h', minutes: 60 },
    { key: '4h', label: '4h', minutes: 240 },
    { key: '12h', label: '12h', minutes: 720 },
    { key: '24h', label: '24h', minutes: 1440 },
  ];

  useEffect(() => {
    if (selectedTokens.length === 0) return;

    async function fetchStats() {
      setLoading(true);
      try {
        const newStats: Record<string, Record<string, TokenStatsData>> = {};
        
        // 只获取一次24h的数据，然后在前端按时间段过滤
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(`${API_BASE}/dump-radar/events?min_amount=1000000&since=${since24h}&limit=1000`);
        const data = await res.json();
        
        if (data.success) {
          const allEvents = data.data.events as DumpRadarEvent[];
          
          for (const token of selectedTokens) {
            newStats[token] = {};
            const tokenEvents = allEvents.filter(e => e.token_symbol === token);
            
            for (const range of timeRanges) {
              const sinceTime = Date.now() - range.minutes * 60 * 1000;
              const rangeEvents = tokenEvents.filter(e => new Date(e.tx_timestamp).getTime() >= sinceTime);
              
              // 统计总量
              const total = {
                count: rangeEvents.length,
                usd: rangeEvents.reduce((sum, e) => sum + (e.amount_usd || 0), 0),
              };
              
              // 按链统计
              const byChain: Record<string, { count: number; usd: number }> = {};
              for (const event of rangeEvents) {
                const chain = event.network_id;
                if (!byChain[chain]) {
                  byChain[chain] = { count: 0, usd: 0 };
                }
                byChain[chain].count++;
                byChain[chain].usd += event.amount_usd || 0;
              }
              
              newStats[token][range.key] = { total, byChain };
            }
          }
        }
        
        setStats(newStats);
      } catch (error) {
        console.error('Failed to fetch token stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [selectedTokens]);

  const chainLabels: Record<string, string> = {
    eth: 'ETH',
    bsc: 'BSC',
    arb: 'ARB',
    base: 'BASE',
    sol: 'SOL',
  };

  if (loading && Object.keys(stats).length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-1/3"></div>
          <div className="h-20 bg-[var(--color-bg-tertiary)] rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
        {t('dumpRadar.tokenStats')}
        <span className="text-xs text-[var(--color-text-muted)] ml-2">({t('dumpRadar.allChains')})</span>
      </h3>
      
      {selectedTokens.map(token => (
        <div key={token} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">${token}</span>
            {loading && <span className="text-xs text-[var(--color-text-muted)]">...</span>}
          </div>
          
          {/* 时间段统计 */}
          <div className="grid grid-cols-5 gap-1">
            {timeRanges.map(range => {
              const data = stats[token]?.[range.key];
              const hasData = data && data.total.count > 0;
              
              return (
                <div 
                  key={range.key}
                  className={`text-center p-2 rounded-lg ${
                    hasData 
                      ? 'bg-[var(--color-accent-negative)]/10' 
                      : 'bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <div className="text-xs text-[var(--color-text-muted)] mb-1">{range.label}</div>
                  {hasData ? (
                    <>
                      <div className="text-sm font-mono text-[var(--color-accent-negative)]">
                        ${formatNumber(data.total.usd)}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {data.total.count}x
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-[var(--color-text-muted)]">-</div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 24h 各链分布 */}
          {stats[token]?.['24h']?.total.count > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(stats[token]['24h'].byChain)
                .sort((a, b) => b[1].usd - a[1].usd)
                .map(([chain, data]) => (
                  <span 
                    key={chain}
                    className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
                  >
                    {chainLabels[chain] || chain}: ${formatNumber(data.usd)}
                  </span>
                ))
              }
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Telegram Notification Component
function TelegramNotificationCard({ 
  selectedTokens, 
  t 
}: { 
  selectedTokens: Set<string>;
  t: (key: string) => string;
}) {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindCode, setBindCode] = useState('');
  const [botUsername, setBotUsername] = useState('smart_perp_bot');
  const [saving, setSaving] = useState(false);

  // 获取 Telegram 状态
  useEffect(() => {
    if (!isAuthenticated) return;
    
    async function fetchStatus() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE}/telegram/status`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE}/dump-radar/notification-settings`, { headers: getAuthHeaders() }),
        ]);
        
        const statusData = await statusRes.json();
        const settingsData = await settingsRes.json();
        
        if (statusData.success) setTelegramStatus(statusData.data);
        if (settingsData.success) setNotificationSettings(settingsData.data);
      } catch (err) {
        console.error('Failed to fetch telegram status:', err);
      }
    }
    
    fetchStatus();
  }, [isAuthenticated, getAuthHeaders]);

  // 开始绑定 Telegram
  const handleBindTelegram = async () => {
    try {
      const res = await fetch(`${API_BASE}/telegram/bind`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setBindCode(data.data.code);
        setBotUsername(data.data.botUsername);
        setShowBindModal(true);
      }
    } catch (err) {
      console.error('Failed to init telegram binding:', err);
    }
  };

  // 切换通知开关
  const handleToggleNotifications = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dump-radar/notification-settings`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications_enabled: enabled,
          watch_all_tokens: notificationSettings?.watchAllTokens ?? true,
          tokens: notificationSettings?.tokens ?? [],
          threshold_usd: notificationSettings?.thresholdUsd ?? 1000000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationSettings(prev => prev ? { ...prev, notificationsEnabled: enabled } : null);
      }
    } catch (err) {
      console.error('Failed to toggle notifications:', err);
    } finally {
      setSaving(false);
    }
  };

  // 切换监控全部/指定代币
  const handleToggleWatchAll = async (watchAll: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dump-radar/notification-settings`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications_enabled: notificationSettings?.notificationsEnabled ?? true,
          watch_all_tokens: watchAll,
          tokens: watchAll ? [] : Array.from(selectedTokens).filter(s => s !== '__none__'),
          threshold_usd: notificationSettings?.thresholdUsd ?? 1000000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationSettings(prev => prev ? { 
          ...prev, 
          watchAllTokens: watchAll,
          tokens: watchAll ? [] : Array.from(selectedTokens).filter(s => s !== '__none__'),
        } : null);
      }
    } catch (err) {
      console.error('Failed to update watch all:', err);
    } finally {
      setSaving(false);
    }
  };

  // 同步当前选择的代币到通知设置
  const handleSyncTokens = async () => {
    const tokens = Array.from(selectedTokens).filter(s => s !== '__none__');
    if (tokens.length === 0) return;
    
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dump-radar/notification-settings`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications_enabled: notificationSettings?.notificationsEnabled ?? true,
          watch_all_tokens: false,
          tokens: tokens,
          threshold_usd: notificationSettings?.thresholdUsd ?? 1000000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationSettings(prev => prev ? { 
          ...prev, 
          watchAllTokens: false,
          tokens: tokens,
        } : null);
      }
    } catch (err) {
      console.error('Failed to sync tokens:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          {t('dumpRadar.notifications')}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('dumpRadar.loginToNotify')}
        </p>
      </div>
    );
  }

  // 未绑定 Telegram
  if (!telegramStatus?.verified) {
    return (
      <>
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
            {t('dumpRadar.notifications')}
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            {t('dumpRadar.bindTelegramHint')}
          </p>
          <button
            onClick={handleBindTelegram}
            className="w-full px-4 py-2 bg-[#0088cc] text-white rounded-lg text-sm font-medium hover:bg-[#0088cc]/90 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1.0.53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.25.38-.51 1.07-.78 4.19-1.82 6.98-3.03 8.38-3.61 3.99-1.66 4.82-1.95 5.36-1.96.12 0 .37.03.54.17.14.12.18.28.2.45-.01.07-.01.13-.02.2z"/>
            </svg>
            {t('telegram.bind')}
          </button>
        </div>

        {/* Bind Modal */}
        {showBindModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl p-6 max-w-md w-full border border-[var(--color-border)] shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('telegram.bindTitle')}</h3>
                <button onClick={() => setShowBindModal(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-3 text-left">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent-blue)] text-white text-sm flex items-center justify-center">1</span>
                    <div>
                      <p className="text-sm text-[var(--color-text-primary)]">{t('telegram.step1')}</p>
                      <a 
                        href={`https://t.me/${botUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-accent-blue)] hover:underline"
                      >
                        @{botUsername}
                      </a>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent-blue)] text-white text-sm flex items-center justify-center">2</span>
                    <p className="text-sm text-[var(--color-text-primary)]">{t('telegram.step2')}</p>
                  </div>
                </div>
                
                <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 text-center">
                  <p className="text-2xl font-mono font-bold text-[var(--color-accent-primary)] tracking-widest">
                    {bindCode}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">{t('telegram.codeValid')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 已绑定 - 显示通知设置
  return (
    <div className="glass-card rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
          {t('dumpRadar.notifications')}
        </h3>
        {telegramStatus.username && (
          <span className="text-xs text-[var(--color-accent-blue)]">
            @{telegramStatus.username}
          </span>
        )}
      </div>

      {/* 通知开关 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-primary)]">
          {t('dumpRadar.enableNotification')}
        </span>
        <button
          onClick={() => handleToggleNotifications(!notificationSettings?.notificationsEnabled)}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            notificationSettings?.notificationsEnabled 
              ? 'bg-[var(--color-accent-primary)]' 
              : 'bg-[var(--color-bg-tertiary)]'
          } ${saving ? 'opacity-50' : ''}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            notificationSettings?.notificationsEnabled ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      {notificationSettings?.notificationsEnabled && (
        <>
          {/* 监控范围 */}
          <div className="space-y-2">
            <span className="text-xs text-[var(--color-text-muted)]">{t('dumpRadar.watchScope')}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleWatchAll(true)}
                disabled={saving}
                className={`flex-1 px-3 py-2 rounded-lg text-xs transition-all ${
                  notificationSettings?.watchAllTokens
                    ? 'bg-[var(--color-accent-primary)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t('dumpRadar.allTokens')}
              </button>
              <button
                onClick={() => handleToggleWatchAll(false)}
                disabled={saving}
                className={`flex-1 px-3 py-2 rounded-lg text-xs transition-all ${
                  !notificationSettings?.watchAllTokens
                    ? 'bg-[var(--color-accent-primary)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t('dumpRadar.selectedOnly')}
              </button>
            </div>
          </div>

          {/* 指定代币模式 */}
          {!notificationSettings?.watchAllTokens && (
            <div className="space-y-2">
              {notificationSettings?.tokens && notificationSettings.tokens.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {notificationSettings.tokens.map(symbol => (
                    <span
                      key={symbol}
                      className="px-2 py-1 rounded text-xs bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    >
                      ${symbol}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('dumpRadar.noTokensSelected')}
                </p>
              )}
              
              {/* 同步当前选择 */}
              {selectedTokens.size > 0 && !selectedTokens.has('__none__') && (
                <button
                  onClick={handleSyncTokens}
                  disabled={saving}
                  className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg text-xs hover:bg-[var(--color-bg-tertiary)]/80 transition-colors"
                >
                  {t('dumpRadar.syncCurrentSelection')} ({selectedTokens.size})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Main Component
export function DumpRadar() {
  const { t } = useLanguage();
  const { isAuthenticated, getAuthHeaders } = useAuth();
  
  // Data states
  const [networks, setNetworks] = useState<BlockchainNetwork[]>([]);
  const [binanceTokens, setBinanceTokens] = useState<BinanceToken[]>([]);
  const [events, setEvents] = useState<DumpRadarEvent[]>([]);
  
  // Filter states
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set()); // 空集合 = 全部
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [minAmount, setMinAmount] = useState(1000000); // 默认 $1M
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const [networksRes, tokensRes] = await Promise.all([
          fetch(`${API_BASE}/dump-radar/networks`),
          fetch(`${API_BASE}/dump-radar/binance-tokens`),
        ]);
        
        const networksData = await networksRes.json();
        const tokensData = await tokensRes.json();
        
        if (networksData.success) setNetworks(networksData.data);
        if (tokensData.success) setBinanceTokens(tokensData.data);
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      }
    }
    
    fetchInitialData();
  }, []);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (selectedNetwork) params.set('network', selectedNetwork);
      params.set('min_amount', String(minAmount));
      params.set('limit', '50');
      
      // 如果选择了特定代币，添加到筛选（需要后端支持 symbol 筛选）
      // 目前后端只支持 token_id，暂时在前端过滤
      
      const res = await fetch(`${API_BASE}/dump-radar/events?${params}`);
      const data = await res.json();
      
      if (data.success) {
        let filteredEvents = data.data.events;
        
        // 前端过滤代币（如果不是全选）
        if (selectedTokens.size > 0) {
          filteredEvents = filteredEvents.filter((e: DumpRadarEvent) => 
            selectedTokens.has(e.token_symbol || '')
          );
        }
        
        setEvents(filteredEvents);
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError(t('dumpRadar.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedNetwork, minAmount, selectedTokens, t]);
  
  useEffect(() => {
    fetchEvents();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Token selection handlers
  const handleToggleToken = (symbol: string) => {
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedTokens(new Set()); // 空集合表示全选
  };

  const handleRemoveToken = (symbol: string) => {
    setSelectedTokens(prev => {
      const next = new Set(prev);
      next.delete(symbol);
      // 如果删除后为空，恢复为"全部"模式
      if (next.size === 0 || (next.size === 1 && next.has('__none__'))) {
        return new Set();
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {t('dumpRadar.title')}
          </h1>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-accent-negative)]/10 text-[var(--color-accent-negative)]">
            BETA
          </span>
        </div>
        <p className="text-[var(--color-text-muted)]">
          {t('dumpRadar.description')}
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-6">
          {/* Token Selector */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
              {t('dumpRadar.selectTokens')}
            </h3>
            <TokenSelector
              tokens={binanceTokens}
              selectedTokens={selectedTokens}
              onToggle={handleToggleToken}
              onSelectAll={handleSelectAll}
              onRemove={handleRemoveToken}
              searchQuery={tokenSearchQuery}
              onSearchChange={setTokenSearchQuery}
              t={t}
            />
          </div>

          {/* Filters */}
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              {t('flow.filters')}
            </h3>
            
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">
                {t('dumpRadar.network')}
              </label>
              <select
                value={selectedNetwork || ''}
                onChange={(e) => setSelectedNetwork(e.target.value || null)}
                className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)]"
              >
                <option value="">{t('flow.all')}</option>
                {networks.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">
                {t('dumpRadar.minAmount')}
              </label>
              <select
                value={minAmount}
                onChange={(e) => setMinAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)]"
              >
                <option value={1000000}>≥ $1M</option>
                <option value={2000000}>≥ $2M</option>
                <option value={5000000}>≥ $5M</option>
                <option value={10000000}>≥ $10M</option>
                <option value={50000000}>≥ $50M</option>
              </select>
            </div>
          </div>

          {/* Token Stats - 只在选择了具体币种时显示 */}
          {selectedTokens.size > 0 && !selectedTokens.has('__none__') && (
            <TokenStatsCard 
              selectedTokens={Array.from(selectedTokens).filter(s => s !== '__none__')} 
              t={t} 
            />
          )}

          {/* Telegram Notification Settings */}
          <TelegramNotificationCard selectedTokens={selectedTokens} t={t} />
        </div>

        {/* Main Content - Event Feed */}
        <div className="flex-1 min-w-0">
          <div className="glass-card rounded-xl">
            {/* Feed Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t('dumpRadar.realtimeFeed')}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {events.length} {t('home.records')}
                </span>
              </div>
              <button
                onClick={fetchEvents}
                className="text-xs text-[var(--color-accent-blue)] hover:underline"
              >
                {t('common.retry')}
              </button>
            </div>

            {/* Event List */}
            <div className="p-4 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
                    <div className="flex justify-between mb-3">
                      <div className="h-5 w-24 bg-[var(--color-bg-tertiary)] rounded"></div>
                      <div className="h-4 w-20 bg-[var(--color-bg-tertiary)] rounded"></div>
                    </div>
                    <div className="h-8 w-32 bg-[var(--color-bg-tertiary)] rounded mb-3"></div>
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
                    onClick={fetchEvents}
                    className="mt-4 px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg text-sm hover:bg-[var(--color-bg-tertiary)]/80 transition-colors"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <p>{t('dumpRadar.noEvents')}</p>
                  <p className="text-xs mt-1">{t('dumpRadar.noEventsHint')}</p>
                </div>
              ) : (
                events.map(event => (
                  <EventCard key={event.id} event={event} t={t} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
