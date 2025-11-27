import { useState, useEffect } from 'react';
import { fetchLastSync } from '../services/api';

interface Platform {
  id: string;
  name: string;
  enabled: boolean;
}

const platforms: Platform[] = [
  { id: 'hyperliquid', name: 'Hyperliquid', enabled: true },
  { id: 'lighter', name: 'Lighter', enabled: false },
  { id: 'aster', name: 'Aster', enabled: false },
];

export function Header() {
  const [selectedPlatform, setSelectedPlatform] = useState('hyperliquid');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Fetch last sync time on mount and every 60 seconds
  useEffect(() => {
    const fetchSync = async () => {
      const data = await fetchLastSync();
      setLastSyncAt(data.lastSyncAt);
      
      // Check if data is stale (more than 24 hours old)
      if (data.lastSyncAt) {
        const syncTime = new Date(data.lastSyncAt).getTime();
        const now = Date.now();
        const hoursSinceSync = (now - syncTime) / (1000 * 60 * 60);
        setIsStale(hoursSinceSync > 24);
      }
    };

    fetchSync();
    const interval = setInterval(fetchSync, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Format the last sync time
  const formatLastSync = () => {
    if (!lastSyncAt) return '未同步';
    
    const syncDate = new Date(lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    
    return syncDate.toLocaleDateString('zh-CN', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--color-border)]">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-green)] flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-black"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--color-accent-green)] rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-[var(--color-accent-blue)] to-[var(--color-accent-green)] bg-clip-text text-transparent">
                  Smart Perp
                </span>{' '}
                <span className="text-[var(--color-text-secondary)]">Radar</span>
              </h1>
              <p className="text-xs text-[var(--color-text-muted)]">
                聪明钱雷达 · 追踪顶级交易者
              </p>
            </div>
          </div>

          {/* Platform Selector */}
          <div className="flex items-center gap-2">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => platform.enabled && setSelectedPlatform(platform.id)}
                disabled={!platform.enabled}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${
                    selectedPlatform === platform.id
                      ? 'bg-[var(--color-accent-blue)]/20 text-[var(--color-accent-blue)] border border-[var(--color-accent-blue)]/30'
                      : platform.enabled
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-transparent hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border border-transparent cursor-not-allowed opacity-50'
                  }
                `}
              >
                {platform.name}
                {!platform.enabled && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider opacity-60">Soon</span>
                )}
              </button>
            ))}
          </div>

          {/* Last Sync Time */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                数据更新
              </p>
              <div className="flex items-center gap-2">
                {/* Status indicator */}
                <div 
                  className={`w-2 h-2 rounded-full ${
                    isStale 
                      ? 'bg-[var(--color-accent-red)]' 
                      : lastSyncAt 
                        ? 'bg-[var(--color-accent-green)]' 
                        : 'bg-yellow-500'
                  }`}
                  title={isStale ? 'Worker 可能已停止' : '正常运行'}
                />
                <p className={`text-lg font-semibold font-mono ${
                  isStale 
                    ? 'text-[var(--color-accent-red)]' 
                    : 'text-[var(--color-text-secondary)]'
                }`}>
                  {formatLastSync()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
