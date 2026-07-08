import React, { createContext, useState, useContext, useEffect } from 'react';
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

  const loadUser = async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await wedflow.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
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
    // Supabase also emits TOKEN_REFRESHED (and re-fires INITIAL_SESSION) whenever the
    // tab regains focus/visibility and refreshes its access token. Those events still
    // carry a valid session and must NOT be treated as a fresh sign-in: calling
    // loadUser() for them flips isLoadingAuth back to true, which unmounts the whole
    // authenticated app tree (see App.jsx) and wipes any in-progress form state, making
    // it look like the page reloaded every time the user alt-tabs back to the browser.
    const { data: sub } = wedflow.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Session was silently renewed in the background; nothing to re-render for.
        return;
      }
      if (session) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          loadUser();
        }
        // Other events with a session (e.g. USER_UPDATED) don't need a full reload.
      } else {
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
