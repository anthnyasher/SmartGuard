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
        await fetch((import.meta.env.VITE_API_BASE_URL || "https://smartguard.54.206.184.54.nip.io") + "/api/auth/logout/", {
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
  const updateActivity = useCallback(() => {
    if (token) {
      localStorage.setItem("lastActivity", Date.now().toString());
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // Set initial activity
    updateActivity();

    // Check inactivity every 30 seconds
    const interval = setInterval(() => {
      const lastActive = parseInt(localStorage.getItem("lastActivity") || "0", 10);
      if (Date.now() - lastActive > SESSION_TIMEOUT_MS) {
        console.warn("[SmartGuard] Session timed out due to inactivity.");
        logout();
      }
    }, 30000);

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    const handler = () => updateActivity();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearInterval(interval);
    };
  }, [token, updateActivity, logout]);

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
        if (err.response?.status === 401) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          setToken(null);
          setRefreshToken(null);
          setUser(null);
        } else {
          // Network error or 5xx: keep tokens, just don't set user for now or show error
          // (We'll leave user=null so it might redirect to login, but if we don't clear token, it might recover)
          // Wait, if user=null, App.jsx redirects to /login. We should probably keep the old user or handle it better.
          // But actually, if init fails due to network, we can't let them in without user object. 
          // At least not clearing the token allows them to just reload when the server is back up without having to re-type credentials.
          console.error("Network or server error during auth init", err);
          setUser(null); // Still kicks them out to login screen if no user, but won't lose token.
        }
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
    <AuthContext.Provider value={{ user, setUser, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
