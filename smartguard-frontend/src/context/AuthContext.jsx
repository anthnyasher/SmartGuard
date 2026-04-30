// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getMe } from "../api/authApi";

const AuthContext = createContext(null);

// ── Session timeout (30 minutes of inactivity) ──────────────────────────────
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem("accessToken") || null
  );
  const [refreshToken, setRefreshToken] = useState(
    () => localStorage.getItem("refreshToken") || null
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef(null);

  // ── Logout (calls backend to blacklist refresh token) ──────────────────────
  const logout = useCallback(async () => {
    // Attempt to blacklist the refresh token on the server
    if (refreshToken && token) {
      try {
        await fetch("http://localhost:8000/api/auth/logout/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh: refreshToken }),
        });
      } catch {
        // best-effort — if server is unreachable, still clear local state
      }
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }, [token, refreshToken]);

  // ── Inactivity timer ───────────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (token) {
      timeoutRef.current = setTimeout(() => {
        console.warn("[SmartGuard] Session timed out due to inactivity.");
        logout();
      }, SESSION_TIMEOUT_MS);
    }
  }, [token, logout]);

  useEffect(() => {
    if (!token) return;

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    const handler = () => resetTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimer(); // start the timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [token, resetTimer]);

  // ── Init: fetch user profile on mount ──────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await getMe(token);
        setUser(me);
      } catch (err) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        setToken(null);
        setRefreshToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [token]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (accessToken, newRefreshToken) => {
    localStorage.setItem("accessToken", accessToken);
    if (newRefreshToken) {
      localStorage.setItem("refreshToken", newRefreshToken);
      setRefreshToken(newRefreshToken);
    }
    setToken(accessToken);
    try {
      const me = await getMe(accessToken);
      setUser(me);
    } catch (err) {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
