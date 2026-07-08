import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { wedflow } from '@/api/wedflowClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with consumers; there is no public-settings
  // step anymore, so these resolve immediately.
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState({});
  // Tracks the id of the user we currently have loaded, so the auth-state
  // listener (a stable closure set up once in the effect below) can tell a
  // genuine new sign-in apart from Supabase re-confirming the same session.
  const loadedUserIdRef = useRef(null);

  const loadUser = async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await wedflow.auth.me();
      loadedUserIdRef.current = currentUser.id;
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      loadedUserIdRef.current = null;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    loadUser();
    // React to sign-in / sign-out from anywhere (login form, OAuth redirect, logout).
    //
    // Supabase's GoTrueClient also listens for the page's `visibilitychange`
    // event itself, and whenever the tab regains visibility it re-validates
    // the session (`_recoverAndRefresh`). If the session is still valid, that
    // re-emits a `SIGNED_IN` event (not just `TOKEN_REFRESHED`) with the same
    // user every single time the user alt-tabs back to the browser — even
    // though nothing about the auth state actually changed.
    //
    // Treating every `SIGNED_IN`/`INITIAL_SESSION` event as a fresh sign-in
    // (the naive `if (session) loadUser()`) calls loadUser(), which flips
    // isLoadingAuth back to true. App.jsx renders a full-page spinner while
    // isLoadingAuth is true, unmounting the whole authenticated app tree and
    // wiping any in-progress form state — this is what made the app look
    // like it reloaded on every tab refocus.
    //
    // The fix: only actually reload the user profile when the signed-in
    // user is someone other than who we already have loaded (a real new
    // sign-in, or an account switch). A same-user re-confirmation from a
    // background visibility check is a no-op.
    const { data: sub } = wedflow.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Session was silently renewed in the background; nothing to re-render for.
        return;
      }
      if (session) {
        if (
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
          session.user?.id !== loadedUserIdRef.current
        ) {
          loadUser();
        }
        // Same user re-confirmed (e.g. tab-focus session recovery), or other
        // events with a session (e.g. USER_UPDATED): no full reload needed.
      } else {
        loadedUserIdRef.current = null;
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const logout = async () => {
    await wedflow.auth.logout();
    loadedUserIdRef.current = null;
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    wedflow.auth.redirectToLogin();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState: loadUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
