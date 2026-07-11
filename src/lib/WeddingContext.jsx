import React, { createContext, useState, useContext, useEffect } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const WeddingContext = createContext();
const STORAGE_KEY = 'activeWeddingId';

// Pure: merge the active membership's per-wedding fields onto the profile.
export function synthUser(profile, membership) {
  if (!profile) return null;
  return {
    ...profile,
    role: membership?.role,
    wedding_sides: membership?.wedding_sides ?? [],
    max_guests: membership?.max_guests ?? null,
  };
}

export const WeddingProvider = ({ children }) => {
  const { user: authUser, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [weddings, setWeddings] = useState([]);
  const [activeWeddingId, setActiveWeddingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isPlatformAdmin = !!profile?.is_platform_admin;
  const activeMembership = memberships.find(m => m.wedding_id === activeWeddingId) || null;
  const user = synthUser(profile, activeMembership);
  const isAdmin = isPlatformAdmin || ['owner', 'coplanner'].includes(activeMembership?.role);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !authUser) {
      setProfile(null); setMemberships([]); setWeddings([]); setActiveWeddingId(null);
      setIsLoading(false); return;
    }
    setIsLoading(true);
    (async () => {
      try {
        setProfile(authUser);
        const membersPromise = supabase
          .from('wedding_members')
          .select('wedding_id, role, wedding_sides, max_guests, weddings(*)')
          .eq('user_id', authUser.id);
        // Platform admins see ALL weddings (RLS grants them full access), not just memberships.
        const adminWeddingsPromise = authUser.is_platform_admin
          ? supabase.from('weddings').select('*')
          : Promise.resolve({ data: null });
        const [{ data: rows }, { data: allW }] = await Promise.all([membersPromise, adminWeddingsPromise]);
        const ms = rows || [];
        let ws = ms.map(r => r.weddings).filter(Boolean);
        if (authUser.is_platform_admin && allW) ws = allW;
        if (cancelled) return;
        setMemberships(ms.map(({ weddings, ...m }) => m));
        setWeddings(ws);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && ws.some(w => w.id === stored)) setActiveWeddingId(stored);
        else if (ws.length > 0) setActiveWeddingId(ws[0].id);
        else setActiveWeddingId(null);
      } catch (e) {
        console.error('WeddingContext load failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, authUser?.id]);

  const selectWedding = (id) => {
    setActiveWeddingId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY);
  };

  const refreshWeddings = async () => {
    if (!authUser) return;
    const { data: rows } = await supabase
      .from('wedding_members')
      .select('wedding_id, role, wedding_sides, max_guests, weddings(*)')
      .eq('user_id', authUser.id);
    const ms = rows || [];
    setMemberships(ms.map(({ weddings, ...m }) => m));
    let ws = ms.map(r => r.weddings).filter(Boolean);
    if (profile?.is_platform_admin) {
      const { data: allW } = await supabase.from('weddings').select('*');
      if (allW) ws = allW;
    }
    setWeddings(ws);
  };

  const refreshProfile = async () => {
    try {
      const me = await wedflow.auth.me();
      setProfile(me);
    } catch (e) {
      console.error('refreshProfile failed', e);
    }
  };

  const activeWedding = weddings.find(w => w.id === activeWeddingId) || null;

  return (
    <WeddingContext.Provider value={{
      user, profile, isAdmin, isPlatformAdmin,
      memberships, activeMembership,
      weddings, activeWedding, activeWeddingId,
      hasNoWeddings: !isLoading && weddings.length === 0,
      selectWedding, refreshWeddings, refreshProfile, isLoading,
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
