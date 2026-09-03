import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, getToken, setToken } from "../api/client.js";

const AuthContext = createContext(null);

function toSession(user) {
  const isAdmin = user.role_type === "admin";
  return { token: getToken(), user, type: isAdmin ? "admin" : "member", role: user.role_type };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFromToken() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await apiFetch("/auth/me");
        setSession(toSession(user));
      } catch {
        // Token invalid/expired — clear it silently and fall back to logged-out.
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    loadFromToken();
  }, []);

  async function login(email, password) {
    const { user, token } = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setToken(token);
    setSession(toSession(user));
    return user;
  }

  // Registration is free and immediate — creates the account and logs
  // the user straight in, same as login().
  async function register(payload) {
    const { user, token } = await apiFetch("/auth/register", {
      method: "POST",
      body: payload,
      auth: false,
    });
    setToken(token);
    setSession(toSession(user));
    return user;
  }

  async function forgotPassword(email) {
    return apiFetch("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
  }

  async function resetPassword(uid, token, newPassword) {
    return apiFetch("/auth/reset-password", {
      method: "POST",
      body: { uid, token, newPassword },
      auth: false,
    });
  }

  async function refreshSession() {
    if (!getToken()) return;
    const { user } = await apiFetch("/auth/me");
    setSession(toSession(user));
  }

  function logout() {
    setToken(null);
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, login, register, forgotPassword, resetPassword, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
