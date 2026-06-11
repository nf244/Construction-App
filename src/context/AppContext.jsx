import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as auth from '../services/auth.js';
import { redeemInvitesFor } from '../services/jobs.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    auth
      .currentUser()
      .then(async (u) => {
        if (u) await redeemInvitesFor(u);
        setUser(u);
      })
      .finally(() => setBooting(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const u = await auth.login(email, password);
    await redeemInvitesFor(u);
    setUser(u);
    return u;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const u = await auth.loginWithGoogle();
    if (!u) return null; // user cancelled popup
    await redeemInvitesFor(u);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (fields) => {
    const u = await auth.register(fields);
    await redeemInvitesFor(u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
  }, []);

  return (
    <AppContext.Provider value={{ user, booting, login, loginWithGoogle, register, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
