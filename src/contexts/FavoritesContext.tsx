import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

interface FavoritesContextType {
  favorites: Set<string>; // Set of lowercase addresses
  isLoading: boolean;
  isFavorited: (address: string) => boolean;
  toggleFavorite: (address: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const refreshFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavorites(new Set());
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/favorites/wallets`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      
      if (data.success) {
        const addresses = data.data.map((w: { address: string }) => w.address.toLowerCase());
        setFavorites(new Set(addresses));
      }
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAuthHeaders]);

  // Load favorites when auth changes
  useEffect(() => {
    refreshFavorites();
  }, [isAuthenticated, refreshFavorites]);

  const isFavorited = useCallback((address: string) => {
    return favorites.has(address.toLowerCase());
  }, [favorites]);

  const toggleFavorite = useCallback(async (address: string) => {
    if (!isAuthenticated) {
      throw new Error('Please login to add favorites');
    }

    const normalizedAddress = address.toLowerCase();
    const isCurrentlyFavorited = favorites.has(normalizedAddress);

    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      if (isCurrentlyFavorited) {
        next.delete(normalizedAddress);
      } else {
        next.add(normalizedAddress);
      }
      return next;
    });

    try {
      const method = isCurrentlyFavorited ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/favorites/${address}`, {
        method,
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update favorite');
      }
    } catch (err) {
      // Revert on error
      setFavorites(prev => {
        const next = new Set(prev);
        if (isCurrentlyFavorited) {
          next.add(normalizedAddress);
        } else {
          next.delete(normalizedAddress);
        }
        return next;
      });
      throw err;
    }
  }, [isAuthenticated, favorites, getAuthHeaders]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isLoading,
        isFavorited,
        toggleFavorite,
        refreshFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}

