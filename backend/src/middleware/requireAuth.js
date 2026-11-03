import { supabaseAdmin, assertSupabaseConfigured } from "../config/supabaseClient.js";
import { verifyToken, passwordVersion } from "../utils/jwt.js";
import { toPublicUser } from "../shared/sanitizeUser.js";
import { readSessionToken, failsCsrfCheck } from "../shared/session.js";

// Resolves the session (HttpOnly cookie, or a Bearer header) to the current
// `users` row. Shared by requireAuth and optionalAuth. Returns
// { user } on success or { status, error } on failure.
export async function resolveSession(req) {
  const { token, via } = readSessionToken(req);
  if (!token) return { status: 401, error: "Not signed in" };
  if (failsCsrfCheck(req, via)) return { status: 403, error: "Missing X-Requested-With header" };

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return { status: 401, error: "Invalid or expired token" };
  }
  // Purpose-scoped tokens (OAuth state, password-reset links) must never be
  // usable as a session token, even though they're signed with the same secret.
  if (payload.purpose) return { status: 401, error: "Invalid or expired token" };

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("user_id", payload.user_id)
    .maybeSingle();
  if (error) throw error;
  if (!user) return { status: 401, error: "Account no longer exists" };
  // Tokens issued before the password last changed are dead. (Tokens from
  // before this check existed carry no pwv and expire on their own.)
  if (payload.pwv && payload.pwv !== passwordVersion(user.password_hash)) {
    return { status: 401, error: "Session expired, please sign in again" };
  }
  if (user.status !== "active") return { status: 403, error: "This account is inactive" };
  return { user, via };
}

// Verifies our own JWT (issued at signup/login), then loads the current row
// from `users` so req.user always reflects the latest role/status rather
// than whatever was true when the token was issued.
export async function requireAuth(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const result = await resolveSession(req);
    if (!result.user) return res.status(result.status).json({ error: result.error });
    req.user = toPublicUser(result.user);
    req.authVia = result.via;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
