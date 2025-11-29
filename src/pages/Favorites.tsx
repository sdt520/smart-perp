import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { FavoriteButton } from '../components/FavoriteButton';
import { WalletAddress } from '../components/WalletAddress';

interface FavoriteWallet {
  id: number;
  address: string;
  label: string | null;
  twitter_handle: string | null;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  win_rate_30d: number;
}

interface TelegramStatus {
  bound: boolean;
  verified: boolean;
  username?: string;
  notificationsEnabled: boolean;
  minPositionUsd: number;
}

const MIN_POSITION_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 10000, label: '≥ $10K' },
  { value: 50000, label: '≥ $50K' },
  { value: 100000, label: '≥ $100K' },
  { value: 500000, label: '≥ $500K' },
];

const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

function formatPnL(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)}B`;
  } else if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

// Telegram 绑定弹窗
function TelegramBindModal({ 
  isOpen, 
  onClose, 
  code, 
  botUsername 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  code: string; 
  botUsername: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl p-6 max-w-md w-full border border-[var(--color-border)] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">绑定 Telegram</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              请按以下步骤绑定您的 Telegram：
            </p>
            
            <div className="space-y-3 text-left">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent-blue)] text-white text-sm flex items-center justify-center">1</span>
                <div>
                  <p className="text-sm text-[var(--color-text-primary)]">打开 Telegram 搜索机器人</p>
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
                <p className="text-sm text-[var(--color-text-primary)]">向机器人发送以下验证码</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 text-center">
            <p className="text-2xl font-mono font-bold text-[var(--color-accent-primary)] tracking-widest">
              {code}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">验证码 10 分钟内有效</p>
          </div>
          
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            绑定成功后，您将收到 Telegram 确认消息
          </p>
        </div>
      </div>
    </div>
  );
}

// 通知开关按钮
function NotificationToggle({ 
  enabled, 
  onToggle, 
  disabled = false,
  size = 'normal'
}: { 
  enabled: boolean; 
  onToggle: () => void;
  disabled?: boolean;
  size?: 'small' | 'normal';
}) {
  const sizeClasses = size === 'small' 
    ? 'w-4 h-4' 
    : 'w-5 h-5';

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        flex items-center justify-center rounded-lg transition-all
        ${size === 'small' ? 'p-1.5' : 'p-2'}
        ${enabled 
          ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 hover:bg-[var(--color-accent-primary)]/20' 
          : 'text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={enabled ? '点击暂停通知' : '点击开启通知'}
    >
      {enabled ? (
        <svg className={sizeClasses} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
      ) : (
        <svg className={sizeClasses} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-6-11c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z" opacity="0.3"/>
          <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.73l-1-1.04zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12l7.92 7.88z"/>
        </svg>
      )}
    </button>
  );
}

export function Favorites() {
  const { isAuthenticated, isLoading: authLoading, getAuthHeaders } = useAuth();
  useFavorites(); // Keep context subscription for updates
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<FavoriteWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Telegram 状态
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>({});
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindCode, setBindCode] = useState('');
  const [botUsername, setBotUsername] = useState('smart_perp_bot');
  const [isTogglingAll, setIsTogglingAll] = useState(false);

  // 获取 Telegram 状态
  const fetchTelegramStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/telegram/status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch telegram status:', err);
    }
  }, [getAuthHeaders]);

  // 获取通知设置
  const fetchNotificationSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/telegram/notification-settings`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationSettings(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch notification settings:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    // 等待 auth 加载完成
    if (authLoading) return;
    
    // auth 加载完成后，如果未登录则跳转
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    const fetchFavorites = async () => {
      try {
        const res = await fetch(`${API_BASE}/favorites/wallets`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success) {
          setWallets(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch favorites:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavorites();
    fetchTelegramStatus();
    fetchNotificationSettings();
  }, [isAuthenticated, authLoading, navigate, getAuthHeaders, fetchTelegramStatus, fetchNotificationSettings]);

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

  // 解绑 Telegram
  const handleUnbindTelegram = async () => {
    if (!confirm('确定要解绑 Telegram 吗？解绑后将不再收到通知。')) return;
    
    try {
      const res = await fetch(`${API_BASE}/telegram/unbind`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramStatus({ bound: false, verified: false, notificationsEnabled: false, minPositionUsd: 0 });
      }
    } catch (err) {
      console.error('Failed to unbind telegram:', err);
    }
  };

  // 切换全局通知
  const handleToggleGlobal = async () => {
    if (!telegramStatus?.verified) return;
    
    try {
      const newEnabled = !telegramStatus.notificationsEnabled;
      const res = await fetch(`${API_BASE}/telegram/toggle-global`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramStatus(prev => prev ? { ...prev, notificationsEnabled: newEnabled } : null);
      }
    } catch (err) {
      console.error('Failed to toggle global notifications:', err);
    }
  };

  // 切换单个地址通知
  const handleToggleAddress = async (address: string) => {
    if (!telegramStatus?.verified) return;
    
    const currentEnabled = notificationSettings[address.toLowerCase()] ?? true;
    const newEnabled = !currentEnabled;
    
    try {
      const res = await fetch(`${API_BASE}/telegram/toggle-address/${address}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setNotificationSettings(prev => ({
          ...prev,
          [address.toLowerCase()]: newEnabled,
        }));
      }
    } catch (err) {
      console.error('Failed to toggle address notification:', err);
    }
  };

  // 一键开启/暂停所有
  const handleToggleAll = async (enabled: boolean) => {
    if (!telegramStatus?.verified) return;
    
    setIsTogglingAll(true);
    try {
      const res = await fetch(`${API_BASE}/telegram/toggle-all`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        // 更新所有地址的状态
        const newSettings: Record<string, boolean> = {};
        wallets.forEach(w => {
          newSettings[w.address.toLowerCase()] = enabled;
        });
        setNotificationSettings(newSettings);
      }
    } catch (err) {
      console.error('Failed to toggle all notifications:', err);
    } finally {
      setIsTogglingAll(false);
    }
  };

  // 设置最小仓位
  const handleSetMinPosition = async (minPositionUsd: number) => {
    if (!telegramStatus?.verified) return;
    
    try {
      const res = await fetch(`${API_BASE}/telegram/min-position`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minPositionUsd }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramStatus(prev => prev ? { ...prev, minPositionUsd } : null);
      }
    } catch (err) {
      console.error('Failed to set min position:', err);
    }
  };

  // 等待 auth 加载完成
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[var(--color-text-tertiary)]">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          <span>正在验证登录状态...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // 检查是否所有地址都开启了通知
  const allNotificationsEnabled = wallets.length > 0 && wallets.every(
    w => notificationSettings[w.address.toLowerCase()] !== false
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Link 
              to="/"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">我的收藏</h1>
          </div>
          
          {/* Telegram 绑定状态 */}
          <div className="flex items-center gap-3">
            {telegramStatus?.verified ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-[var(--color-accent-blue)]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1-.54-1.46-.54-.45-.01-1.17-.14-1.74-.27-.7-.16-1.26-.25-1.21-.52.02-.14.28-.29.78-.45 3.07-1.34 5.12-2.21 6.15-2.64 2.93-1.21 3.54-1.43 3.94-1.44.09 0 .28.02.4.12.11.08.14.19.15.27-.01.06.01.24 0 .38z"/>
                  </svg>
                  <span className="text-[var(--color-text-secondary)]">
                    {telegramStatus.username ? `@${telegramStatus.username}` : '已绑定'}
                  </span>
                </div>
                {/* 最小仓位选择器 */}
                <select
                  value={telegramStatus.minPositionUsd}
                  onChange={(e) => handleSetMinPosition(Number(e.target.value))}
                  className="px-2 py-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent-blue)]"
                  title="最小仓位：只推送大于此金额的交易"
                >
                  {MIN_POSITION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <NotificationToggle 
                  enabled={telegramStatus.notificationsEnabled}
                  onToggle={handleToggleGlobal}
                />
                <button
                  onClick={handleUnbindTelegram}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent-negative)] transition-colors"
                >
                  解绑
                </button>
              </>
            ) : (
              <button
                onClick={handleBindTelegram}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1-.54-1.46-.54-.45-.01-1.17-.14-1.74-.27-.7-.16-1.26-.25-1.21-.52.02-.14.28-.29.78-.45 3.07-1.34 5.12-2.21 6.15-2.64 2.93-1.21 3.54-1.43 3.94-1.44.09 0 .28.02.4.12.11.08.14.19.15.27-.01.06.01.24 0 .38z"/>
                </svg>
                绑定 Telegram
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          共收藏 {wallets.length} 个钱包地址
          {telegramStatus?.verified && ' • 绑定 Telegram 后可接收交易通知'}
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="glass-card rounded-2xl p-16 text-center">
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
            <span>正在加载收藏...</span>
          </div>
        </div>
      ) : wallets.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <svg 
            className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)]" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1}
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            还没有收藏任何钱包
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            在排行榜中点击钱包地址左侧的星星图标即可收藏
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/80 text-white rounded-lg transition-colors text-sm font-medium"
          >
            浏览排行榜
          </Link>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* 一键开启/暂停 */}
          {telegramStatus?.verified && wallets.length > 0 && (
            <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/50 flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                批量操作通知
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAll(true)}
                  disabled={isTogglingAll || allNotificationsEnabled}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    allNotificationsEnabled
                      ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] cursor-default'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-primary)]/20 hover:text-[var(--color-accent-primary)]'
                  } ${isTogglingAll ? 'opacity-50' : ''}`}
                >
                  全部开启
                </button>
                <button
                  onClick={() => handleToggleAll(false)}
                  disabled={isTogglingAll || !allNotificationsEnabled}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    !allNotificationsEnabled
                      ? 'bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)] cursor-default'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-text-muted)]/20 hover:text-[var(--color-text-muted)]'
                  } ${isTogglingAll ? 'opacity-50' : ''}`}
                >
                  全部暂停
                </button>
              </div>
            </div>
          )}
          
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-4 text-left text-xs font-medium text-[var(--color-text-muted)] tracking-wide">
                  钱包地址
                </th>
                <th className="px-4 py-4 text-right text-xs font-medium text-[var(--color-text-muted)] tracking-wide">
                  1D PnL
                </th>
                <th className="px-4 py-4 text-right text-xs font-medium text-[var(--color-text-muted)] tracking-wide">
                  7D PnL
                </th>
                <th className="px-4 py-4 text-right text-xs font-medium text-[var(--color-text-muted)] tracking-wide">
                  30D PnL
                </th>
                <th className="px-4 py-4 text-right text-xs font-medium text-[var(--color-text-muted)] tracking-wide">
                  30D 胜率
                </th>
                {telegramStatus?.verified && (
                  <th className="px-4 py-4 text-center text-xs font-medium text-[var(--color-text-muted)] tracking-wide w-16">
                    通知
                  </th>
                )}
                <th className="px-4 py-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => {
                const isNotificationEnabled = notificationSettings[wallet.address.toLowerCase()] !== false;
                
                return (
                  <tr
                    key={wallet.address}
                    className="table-row-hover border-b border-[var(--color-border)]/50 last:border-b-0"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <WalletAddress 
                          address={wallet.address}
                          linkTo={`/trader/${wallet.address}`}
                        />
                        {wallet.label && (
                          <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded">
                            {wallet.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-mono text-sm tabular-nums ${
                        wallet.pnl_1d >= 0 ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'
                      }`}>
                        {wallet.pnl_1d >= 0 ? '+' : ''}${formatPnL(wallet.pnl_1d)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-mono text-sm tabular-nums ${
                        wallet.pnl_7d >= 0 ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'
                      }`}>
                        {wallet.pnl_7d >= 0 ? '+' : ''}${formatPnL(wallet.pnl_7d)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-mono text-sm tabular-nums ${
                        wallet.pnl_30d >= 0 ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-accent-negative)]'
                      }`}>
                        {wallet.pnl_30d >= 0 ? '+' : ''}${formatPnL(wallet.pnl_30d)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)]">
                        {wallet.win_rate_30d.toFixed(1)}%
                      </span>
                    </td>
                    {telegramStatus?.verified && (
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <NotificationToggle
                            enabled={isNotificationEnabled}
                            onToggle={() => handleToggleAddress(wallet.address)}
                            size="small"
                            disabled={!telegramStatus.notificationsEnabled}
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3.5">
                      <FavoriteButton 
                        address={wallet.address}
                        onLoginRequired={() => {}}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Telegram 绑定弹窗 */}
      <TelegramBindModal
        isOpen={showBindModal}
        onClose={() => setShowBindModal(false)}
        code={bindCode}
        botUsername={botUsername}
      />
    </div>
  );
}
