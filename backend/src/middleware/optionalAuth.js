import { resolveSession } from "./requireAuth.js";
import { toPublicUser } from "../shared/sanitizeUser.js";

// Like requireAuth, but never rejects. GET endpoints stay public for
// everyone, this just attaches req.user when a valid session IS present, so
// handlers can compute per-viewer state (e.g. "did I already like this
// post") without gating the whole endpoint behind login.
export async function optionalAuth(req, res, next) {
  try {
    const result = await resolveSession(req);
    if (result.user) req.user = toPublicUser(result.user);
  } catch {
    // Invalid session on a public endpoint: proceed anonymously.
  }
  next();
}
