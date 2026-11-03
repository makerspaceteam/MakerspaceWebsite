import { verifyToken } from "../utils/jwt.js";

// The session JWT lives in an HttpOnly cookie, so page JavaScript (and any
// XSS) can never read it. SameSite=Lax stops other sites from sending it on
// cross-site POST/PUT/DELETE; requireAuth additionally requires an
// X-Requested-With header on cookie-authenticated writes (CSRF defence in
// depth: a cross-origin page can't add that header without a CORS preflight,
// which our CORS policy rejects).
export const SESSION_COOKIE = "mk_session";
const isProd = () => process.env.NODE_ENV === "production";

export function setSessionCookie(res, token) {
  let maxAge = 7 * 24 * 60 * 60 * 1000;
  try {
    const { exp } = verifyToken(token);
    if (exp) maxAge = Math.max(0, exp * 1000 - Date.now());
  } catch { /* fall back to 7 days */ }
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/" });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Bearer header still works (Postman, scripts, and one-time migration of
// sessions that were stored in localStorage before this change).
export function readSessionToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return { token: header.slice(7), via: "bearer" };
  const cookie = readCookie(req, SESSION_COOKIE);
  return cookie ? { token: cookie, via: "cookie" } : { token: null, via: null };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export function failsCsrfCheck(req, via) {
  return via === "cookie" && !SAFE_METHODS.has(req.method) && req.headers["x-requested-with"] !== "fetch";
}
