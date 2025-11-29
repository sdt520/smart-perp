import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { LoginModal } from './LoginModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const [selectedPlatform, setSelectedPlatform] = useState('hyperliquid');
  const [showLoginModal, setShowLoginModal] = useState(false);

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
              {t('header.title')}
            </h1>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/50 transition-all"
            >
              {t('header.walletList')}
            </Link>
            <Link
              to="/flow"
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/50 transition-all"
            >
              {t('header.tradeFlow')}
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

          {/* Right Side: Language Switcher & User Menu */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
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
