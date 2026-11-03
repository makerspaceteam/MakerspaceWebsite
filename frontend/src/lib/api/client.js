export const BASE_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");

// The session lives in an HttpOnly cookie set by the backend, so it is never
// readable from JavaScript (an XSS bug can't steal it). Every request sends
// the cookie (credentials: "include") plus X-Requested-With, which the
// backend requires on cookie-authenticated writes as CSRF protection.

// Sessions from before the cookie switch were kept in localStorage. Sent once
// as a Bearer token so /api/auth/session can move it into the cookie, then
// deleted (see AuthContext).
const LEGACY_TOKEN_KEY = "cadt_token";
function legacyToken() {
  try { return localStorage.getItem(LEGACY_TOKEN_KEY); } catch { return null; }
}
export function clearLegacyToken() {
  try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* storage unavailable */ }
}

// Whether the user is signed in, kept in sync by AuthContext. Replaces the old
// "is there a token in localStorage" check for hooks that only need a yes/no.
let sessionActive = false;
export function setSessionActive(active) { sessionActive = Boolean(active); }
export function hasSession() { return sessionActive; }

// fetch() with the session cookie and CSRF header attached. Used directly by
// multipart uploads; JSON calls go through `api` below.
export function authFetch(path, options = {}) {
  const headers = { "X-Requested-With": "fetch", ...(options.headers || {}) };
  const legacy = legacyToken();
  if (legacy) headers.Authorization = `Bearer ${legacy}`;
  return fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: "include" });
}

async function request(path, { method = "GET", body } = {}) {
  const res = await authFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  del: (path) => request(path, { method: "DELETE" }),
};
