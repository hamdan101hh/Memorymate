import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api from "../lib/api";
import { getToken, setToken, clearToken, isTokenExpired } from "../lib/token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = guest, object = user
  const [settings, setSettings] = useState(() => ({
    largeText: localStorage.getItem("mm_large_text") === "1",
    highContrast: localStorage.getItem("mm_high_contrast") === "1",
  }));

  const loadMe = useCallback(async () => {
    const token = getToken();
    if (!token || isTokenExpired(token)) {
      clearToken();
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      clearToken();
      setUser(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    document.documentElement.classList.toggle("mm-large-text", settings.largeText);
    document.documentElement.classList.toggle("mm-high-contrast", settings.highContrast);
    localStorage.setItem("mm_large_text", settings.largeText ? "1" : "0");
    localStorage.setItem("mm_high_contrast", settings.highContrast ? "1" : "0");
  }, [settings]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Logs into a seeded demo account. No passwords live in the frontend — the backend
  // resolves the role to a demo user and issues the token.
  const demoLogin = useCallback(async (role) => {
    const { data } = await api.post("/auth/demo-login", { role });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(false);
  }, []);

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);

  // Memoized so consumers don't re-render unless something they use actually changes.
  const value = useMemo(
    () => ({ user, login, demoLogin, register, logout, refreshUser: loadMe, setUser, settings, updateSettings }),
    [user, settings, login, demoLogin, register, logout, loadMe, updateSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
