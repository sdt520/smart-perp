import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchLastSync } from '../services/api';
import { UserMenu } from './UserMenu';
import { LoginModal } from './LoginModal';

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
  const [showLoginModal, setShowLoginModal] = useState(false);

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
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    
    return syncDate.toLocaleDateString('zh-CN', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--color-bg-primary)]/90 border-b border-[var(--color-border)]">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img 
              src="/logo.png" 
              alt="Smart Perp" 
              className="h-8 w-8 object-contain"
            />
            <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
              Smart Perp
            </h1>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/50 transition-all"
            >
              排行榜
            </Link>
            <Link
              to="/flow"
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/50 transition-all"
            >
              交易流
            </Link>
            <div className="w-px h-4 bg-[var(--color-border)] mx-2"></div>
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => platform.enabled && setSelectedPlatform(platform.id)}
                disabled={!platform.enabled}
                className={`
                  px-3 py-1.5 rounded-lg text-sm transition-all duration-200
                  ${
                    selectedPlatform === platform.id
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                      : platform.enabled
                      ? 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50'
                      : 'text-[var(--color-text-muted)] cursor-not-allowed'
                  }
                `}
              >
                {platform.name}
                {!platform.enabled && (
                  <span className="ml-1.5 text-[10px] opacity-50">Soon</span>
                )}
              </button>
            ))}
          </nav>

          {/* Right Side: Last Sync Time + User Menu */}
          <div className="flex items-center gap-4">
            {/* Last Sync Time */}
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest mb-0.5">
                更新时间
              </p>
              <div className="flex items-center gap-2 justify-end">
                <div 
                  className={`w-1.5 h-1.5 rounded-full ${
                    isStale 
                      ? 'bg-[var(--color-accent-negative)]' 
                      : lastSyncAt 
                        ? 'bg-[var(--color-accent-primary)]' 
                        : 'bg-amber-500'
                  }`}
                />
                <p className={`text-sm font-mono ${
                  isStale 
                    ? 'text-[var(--color-accent-negative)]' 
                    : 'text-[var(--color-text-secondary)]'
                }`}>
                  {formatLastSync()}
                </p>
              </div>
            </div>

            {/* User Menu */}
            <UserMenu onLoginClick={() => setShowLoginModal(true)} />
          </div>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
    </header>
  );
}
