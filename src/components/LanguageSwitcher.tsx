import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { type Language, languageNames } from '../i18n/translations';

const languages: Language[] = ['en', 'zh', 'ja', 'ko', 'ru'];

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        zIndex: 9999,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdown = isOpen && createPortal(
    <div
      style={dropdownStyle}
      className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden min-w-[140px]"
    >
      {languages.map((lang) => (
        <button
          key={lang}
          onClick={() => {
            setLanguage(lang);
            setIsOpen(false);
          }}
          className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2 ${
            language === lang
              ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
              : 'text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
          }`}
        >
          <span className="font-medium">{lang.toUpperCase()}</span>
          <span className="text-[var(--color-text-muted)]">{languageNames[lang]}</span>
        </button>
      ))}
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
        title="Language"
      >
        {/* Globe Icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 21a9 9 0 100-18 9 9 0 000 18z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.6 9h16.8M3.6 15h16.8"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3c2.21 3.18 3.5 6.24 3.5 9s-1.29 5.82-3.5 9c-2.21-3.18-3.5-6.24-3.5-9s1.29-5.82 3.5-9z"
          />
        </svg>
      </button>
      {dropdown}
    </>
  );
}

