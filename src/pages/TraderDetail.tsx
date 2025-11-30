import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TraderOverview } from '../components/trader/TraderOverview';
import { PnlChart } from '../components/trader/PnlChart';
import { PositionsTable } from '../components/trader/PositionsTable';
import { TradesTable } from '../components/trader/TradesTable';
import { fetchTraderDetail, fetchTraderPositions, fetchTraderTrades, type TraderDetail as TraderDetailType, type Position, type Trade } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

type TabType = 'positions' | 'trades';

export function TraderDetail() {
  const { t } = useLanguage();
  const { address } = useParams<{ address: string }>();
  const [trader, setTrader] = useState<TraderDetailType | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('positions');

  useEffect(() => {
    if (!address) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [traderData, positionsData, tradesData] = await Promise.all([
          fetchTraderDetail(address),
          fetchTraderPositions(address),
          fetchTraderTrades(address),
        ]);
        setTrader(traderData);
        setPositions(positionsData);
        setTrades(tradesData);
      } catch (err) {
        console.error('Error loading trader data:', err);
        setError(t('flow.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[var(--color-text-tertiary)]">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-[var(--color-text-muted)] text-center">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-lg mb-2">{error || t('detail.traderNotFound')}</p>
          <Link 
            to="/" 
            className="text-sm text-[var(--color-accent-primary)] hover:underline"
          >
            {t('home.backToLeaderboard')}
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'positions', label: t('home.currentPositions') },
    { id: 'trades', label: t('detail.history') },
  ];

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t('home.backToLeaderboard')}
        </Link>
      </div>

      {/* Top Section: Overview & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <TraderOverview trader={trader} />
        <PnlChart data={trader.pnlHistory} />
      </div>

      {/* Bottom Section: Tabs */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-[var(--color-border)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-6 py-4 text-sm font-medium transition-colors relative
                ${activeTab === tab.id 
                  ? 'text-[var(--color-text-primary)]' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }
              `}
            >
              {tab.label}
              {tab.id === 'positions' && positions.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded">
                  {positions.length}
                </span>
              )}
              {tab.id === 'trades' && trades.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded">
                  {trades.length}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-0">
          {activeTab === 'positions' && (
            <PositionsTable positions={positions} title={t('home.currentPositions')} />
          )}
          {activeTab === 'trades' && (
            <TradesTable trades={trades} />
          )}
        </div>
      </div>
    </div>
  );
}

