import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

interface NotesContextType {
  notes: Record<string, string>; // walletAddress -> note
  getNote: (walletAddress: string) => string | undefined;
  saveNote: (walletAddress: string, note: string) => Promise<void>;
  deleteNote: (walletAddress: string) => Promise<void>;
  isLoading: boolean;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 获取所有备注
  const fetchNotes = useCallback(async () => {
    if (!isAuthenticated) {
      setNotes({});
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      
      if (data.success) {
        const notesMap: Record<string, string> = {};
        for (const item of data.data) {
          notesMap[item.walletAddress.toLowerCase()] = item.note;
        }
        setNotes(notesMap);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAuthHeaders]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const getNote = useCallback((walletAddress: string) => {
    return notes[walletAddress.toLowerCase()];
  }, [notes]);

  const saveNote = useCallback(async (walletAddress: string, note: string) => {
    if (!isAuthenticated) return;

    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ walletAddress, note }),
      });
      
      const data = await res.json();
      if (data.success) {
        setNotes(prev => ({
          ...prev,
          [walletAddress.toLowerCase()]: note,
        }));
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      throw error;
    }
  }, [isAuthenticated, getAuthHeaders]);

  const deleteNote = useCallback(async (walletAddress: string) => {
    if (!isAuthenticated) return;

    try {
      await fetch(`${API_BASE}/notes/${walletAddress}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      
      setNotes(prev => {
        const newNotes = { ...prev };
        delete newNotes[walletAddress.toLowerCase()];
        return newNotes;
      });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  }, [isAuthenticated, getAuthHeaders]);

  return (
    <NotesContext.Provider value={{ notes, getNote, saveNote, deleteNote, isLoading }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
}


