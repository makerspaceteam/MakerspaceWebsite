import crypto from "crypto";

// One-time handoff codes. Anything sensitive that has to survive a browser
// redirect (a session token after Microsoft sign-in, a reset token, a
// pending signup with its password hash) is parked here and only an opaque,
// random, single-use, short-lived code goes into the URL. The page then
// swaps the code for the real data with a POST (see /api/auth/exchange), so
// tokens never land in browser history, proxy/Traefik access logs, or a
// Referer header.
//
// In-memory: fine for the single app container this runs as. If the app is
// ever scaled to several replicas, move this to Redis or a DB table.
const store = new Map();
const MAX_ENTRIES = 10_000;

function sweep() {
  const now = Date.now();
  for (const [code, entry] of store) if (entry.exp <= now) store.delete(code);
}
setInterval(sweep, 60_000).unref();

export function issueHandoff(kind, payload, ttlSeconds = 120) {
  if (store.size >= MAX_ENTRIES) sweep();
  if (store.size >= MAX_ENTRIES) throw Object.assign(new Error("Too many pending sign-ins, try again shortly"), { status: 503 });
  const code = crypto.randomBytes(32).toString("base64url");
  store.set(code, { kind, payload, exp: Date.now() + ttlSeconds * 1000 });
  return code;
}

// Returns the payload once; the code is deleted on first use (or on a
// kind mismatch, so a code can't be probed against several kinds).
export function consumeHandoff(code, kind) {
  if (typeof code !== "string" || code.length > 100) return null;
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (entry.kind !== kind || entry.exp <= Date.now()) return null;
  return entry.payload;
}
