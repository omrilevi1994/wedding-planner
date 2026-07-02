import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const WeddingContext = createContext();

const STORAGE_KEY = 'activeWeddingId';

export const WeddingProvider = ({ children }) => {
  const { user: authUser, isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [weddings, setWeddings] = useState([]);
  const [activeWeddingId, setActiveWeddingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  // Load current user + weddings whenever the authenticated user changes.
  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || !authUser) {
      setUser(null);
      setWeddings([]);
      setActiveWeddingId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const load = async () => {
      try {
        const currentUser = authUser;
        if (cancelled) return;
        setUser(currentUser);

        if (currentUser.role === 'admin') {
          // Admin can see all weddings and choose one
          const allWeddings = await base44.entities.Wedding.list('-created_date');
          if (cancelled) return;
          setWeddings(allWeddings);

          // Restore last selection from storage
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && allWeddings.some(w => w.id === stored)) {
            setActiveWeddingId(stored);
          } else if (allWeddings.length > 0) {
            setActiveWeddingId(allWeddings[0].id);
          }
        } else if (currentUser.wedding_id) {
          // Event manager / regular user — locked to their wedding
          setActiveWeddingId(currentUser.wedding_id);
          try {
            const w = await base44.entities.Wedding.get(currentUser.wedding_id);
            if (cancelled) return;
            setWeddings([w]);
          } catch (e) {
            setWeddings([]);
          }
        }
      } catch (e) {
        console.error('WeddingContext load failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, authUser?.id]);

  const selectWedding = (id) => {
    setActiveWeddingId(id);
    if (isAdmin) {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  const refreshWeddings = async () => {
    if (isAdmin) {
      const allWeddings = await base44.entities.Wedding.list('-created_date');
      setWeddings(allWeddings);
    } else if (activeWeddingId) {
      try {
        const w = await base44.entities.Wedding.get(activeWeddingId);
        setWeddings([w]);
      } catch (e) { /* ignore */ }
    }
  };

  const activeWedding = weddings.find(w => w.id === activeWeddingId) || null;

  return (
    <WeddingContext.Provider value={{
      user,
      isAdmin,
      weddings,
      activeWedding,
      activeWeddingId,
      selectWedding,
      refreshWeddings,
      isLoading
    }}>
      {children}
    </WeddingContext.Provider>
  );
};

export const useWedding = () => {
  const ctx = useContext(WeddingContext);
  if (!ctx) throw new Error('useWedding must be used within WeddingProvider');
  return ctx;
};