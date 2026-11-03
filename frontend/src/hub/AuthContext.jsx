import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, clearLegacyToken, setSessionActive } from "../lib/api/client";

const AuthCtx = createContext(null);

// Backend roles are lowercase ('admin'/'staff'/'user'); the rest of the
// frontend (AdminGuard, AdminSidebar's role badge, etc.) was built around
// capitalized roles ('Admin'/'Staff'/'User'); map at the boundary so
// nothing downstream has to care which convention the API uses.
const ROLE_MAP = { admin: "Admin", staff: "Staff", user: "User", lecturer: "Lecturer" };

function toFrontendUser(row) {
  return {
    id: row.user_id,
    name: row.full_name,
    email: row.email,
    studentId: row.student_id || "",
    role: ROLE_MAP[row.role] || "User",
    avatar: row.profile_img_url || null,
    phone: row.phone_number || "",
    bio: row.bio || "",
    // Real account-creation date, for "Member since" on the Profile page.
    createdAt: row.created_at,
    // Filled in separately by loadMembership(); membership/credits live in
    // their own table, fetched after identity so a slow membership lookup
    // never blocks login.
    isMember: false,
    credits: 0,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Single source of truth for isMember/credits; every module reads this
  // instead of keeping its own local copy. Safe to call any time (e.g.
  // after an admin activates membership or adds credits) to pull fresh
  // numbers without a full session reload.
  const refreshMembership = useCallback(async () => {
    try {
      const { data } = await api.get("/api/membership/me");
      setUser(prev => (prev ? { ...prev, isMember: data.isMember, credits: data.credits } : prev));
    } catch {
      // Not fatal; the user just keeps seeing the last-known balance.
    }
  }, []);

  // On mount, ask the backend whether the HttpOnly session cookie (which JS
  // can't read) is still valid, and restore the session if so; otherwise
  // every page refresh would silently sign the user out.
  useEffect(() => {
    api.get("/api/auth/session")
      .then(async ({ user: row }) => {
        clearLegacyToken(); // migrated into the cookie by this call
        setSessionActive(true);
        setUser(toFrontendUser(row));
        // Awaited (not fire-and-forget): toFrontendUser() only sets a
        // placeholder isMember:false, so pages that gate on `loading` to
        // decide "do we actually know this user's membership yet" would
        // otherwise see loading flip to false before the real value lands.
        await refreshMembership();
      })
      .catch(() => { clearLegacyToken(); setSessionActive(false); })
      .finally(() => setLoading(false));
  }, [refreshMembership]);

  // Backend sets the HttpOnly session cookie; nothing to store here.
  const sessionStarted = (row) => {
    setSessionActive(true);
    const mapped = toFrontendUser(row);
    setUser(mapped);
    refreshMembership();
    return mapped;
  };

  const login = async (email, password) => {
    const { user: row } = await api.post("/api/auth/login", { email, password });
    return sessionStarted(row);
  };


  const signup = async ({ name, email, password }) => {
    const { user: row } = await api.post("/api/auth/signup", { full_name: name, email, password });
    return sessionStarted(row);
  };

  // Picks up a session the backend just put in the cookie outside the normal
  // login call (Microsoft callback, reset password, complete signup).
  const loadSession = async () => {
    const { user: row } = await api.get("/api/auth/session");
    return sessionStarted(row);
  };

  const logout = () => {
    setUser(null);
    setSessionActive(false);
    clearLegacyToken();
    api.post("/api/auth/logout").catch(() => {});
  };

  // Patches fields on the current user client-side only, for things that
  // don't need a round trip. Membership/credits go through
  // refreshMembership() instead, since the server owns those now.
  const updateUser = (patch) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, signup, loadSession, sessionStarted, logout, updateUser, refreshMembership }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
