import { useState, useEffect } from 'react';
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

const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

function formatPnL(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

export function Favorites() {
  const { isAuthenticated, isLoading: authLoading, getAuthHeaders } = useAuth();
  useFavorites(); // Keep context subscription for updates
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<FavoriteWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, [isAuthenticated, authLoading, navigate, getAuthHeaders]);

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

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
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
        <p className="text-sm text-[var(--color-text-muted)]">
          共收藏 {wallets.length} 个钱包地址
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
                <th className="px-4 py-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
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
                  <td className="px-4 py-3.5">
                    <FavoriteButton 
                      address={wallet.address}
                      onLoginRequired={() => {}}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

