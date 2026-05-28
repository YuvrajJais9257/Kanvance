import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { me, login as apiLogin, logout as apiLogout } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(undefined); // undefined = loading, null = not authed
  const [loading, setLoading] = useState(true);

  // On mount — check if a session cookie already exists
  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const u = await apiLogin({ email, password });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
