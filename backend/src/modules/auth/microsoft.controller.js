import * as client from "openid-client";
import bcrypt from "bcrypt";
import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { signToken, signPurposeToken, verifyToken, passwordVersion } from "../../utils/jwt.js";
import { issueHandoff, consumeHandoff } from "../../shared/handoff.js";
import { setSessionCookie } from "../../shared/session.js";
import { normalizeEmail, isDomainAllowed, isStudentIdTaken } from "./auth.controller.js";
import { uniqueUserNameFromEmail } from "../../shared/userAccounts.js";
import { toPublicUser } from "../../shared/sanitizeUser.js";

const SALT_ROUNDS = 10;

// Confidential (server-side) client. Microsoft is discovered/configured
// once and cached, not PKCE'd (PKCE is for public/browser clients; we hold
// a client secret here).
let configPromise;
function getConfig() {
  if (!configPromise) {
    const tenant = process.env.MICROSOFT_TENANT_ID || "common";
    configPromise = client.discovery(
      new URL(`https://login.microsoftonline.com/${tenant}/v2.0`),
      process.env.MICROSOFT_CLIENT_ID,
      process.env.MICROSOFT_CLIENT_SECRET
    );
    // Don't cache a failure: one network blip (e.g. a connect timeout to
    // login.microsoftonline.com) would otherwise break Microsoft sign-in
    // for every request until the server restarts.
    configPromise.catch(() => { configPromise = undefined; });
  }
  return configPromise;
}

function frontendRedirect(path, params) {
  const url = new URL(path, process.env.FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

// Looks up a user by their linked Microsoft account, falling back to
// matching (and auto-linking) an existing row by email. Never creates a row.
async function findOrLinkUser({ msId, email }) {
  const normalizedEmail = normalizeEmail(email);
  const { data: byMsId, error: byMsIdError } = await supabaseAdmin
    .from("users").select("*").eq("microsoft_id", msId).maybeSingle();
  if (byMsIdError) throw byMsIdError;
  if (byMsId) return byMsId;

  if (!normalizedEmail) return null;
  const { data: byEmail, error: byEmailError } = await supabaseAdmin
    .from("users").select("*").eq("email", normalizedEmail).maybeSingle();
  if (byEmailError) throw byEmailError;
  if (!byEmail) return null;

  const { error: linkError } = await supabaseAdmin
    .from("users")
    .update({ microsoft_id: msId, microsoft_linked_at: new Date().toISOString() })
    .eq("user_id", byEmail.user_id);
  if (linkError) throw linkError;
  return { ...byEmail, microsoft_id: msId };
}

const VALID_INTENTS = ["login", "reset", "signup_verify"];

export async function microsoftLogin(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const intent = VALID_INTENTS.includes(req.query.intent) ? req.query.intent : "login";
    // For resets and verified sign-up, the caller already told us which
    // email they're claiming (forgotPasswordCheck, or the plain sign-up
    // form itself), so that email rides along in the signed state and the
    // callback insists the Microsoft account actually matches it.
    const claimedEmail = (intent === "reset" || intent === "signup_verify") ? normalizeEmail(req.query.email) : undefined;
    if ((intent === "reset" || intent === "signup_verify") && !claimedEmail) {
      return res.redirect(frontendRedirect(intent === "reset" ? "/forgot-password" : "/register", { error: "missing_email" }));
    }
    // The pending signup (name/email/password hash from startVerifiedSignup)
    // rides through the same signed state, the same trick claimedEmail uses,
    // so nothing has to be persisted server-side just to survive the
    // redirect to Microsoft and back.
    // Opaque one-time id from startVerifiedSignup; the pending data itself
    // stays server-side (shared/handoff.js), never in the URL or OAuth state.
    const pendingId = intent === "signup_verify" ? String(req.query.pending || "") : undefined;
    if (intent === "signup_verify" && !pendingId) {
      return res.redirect(frontendRedirect("/register", { error: "invalid_state" }));
    }
    const cfg = await getConfig();
    const state = signPurposeToken({ intent, claimedEmail, pendingId, purpose: "oauth_state" }, "10m");
    const url = client.buildAuthorizationUrl(cfg, {
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      scope: "openid profile email",
      state,
    });
    res.redirect(url.href);
  } catch (err) {
    next(err);
  }
}

export async function microsoftCallback(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;

  const stateParam = req.query.state;
  let intent = "login";
  let claimedEmail;
  let pendingId;
  try {
    const statePayload = verifyToken(stateParam);
    if (statePayload.purpose !== "oauth_state") throw new Error("wrong purpose");
    intent = statePayload.intent;
    claimedEmail = statePayload.claimedEmail;
    pendingId = statePayload.pendingId;
  } catch {
    return res.redirect(frontendRedirect(intent === "reset" ? "/forgot-password" : intent === "signup_verify" ? "/register" : "/login", { error: "invalid_state" }));
  }

  try {
    const cfg = await getConfig();
    const currentUrl = new URL(req.originalUrl, process.env.MICROSOFT_REDIRECT_URI);
    const tokens = await client.authorizationCodeGrant(cfg, currentUrl, { expectedState: stateParam });
    const claims = tokens.claims();
    const msId = claims.oid || claims.sub;
    const email = normalizeEmail(claims.email || claims.preferred_username);
    const name = claims.name || email;

    if (!email) {
      return res.redirect(frontendRedirect(intent === "reset" ? "/forgot-password" : intent === "signup_verify" ? "/register" : "/login", { error: "no_email" }));
    }

    if ((intent === "reset" || intent === "signup_verify") && email !== claimedEmail) {
      // They asked to verify/recover one account but signed into Microsoft
      // as someone else; proving ownership of a *different* email doesn't count.
      return res.redirect(frontendRedirect(intent === "reset" ? "/forgot-password" : "/register", { error: "email_mismatch" }));
    }

    // Signup verification: Microsoft just proved the person actually owns
    // this exact email. The account gets created now, using the name/
    // password they chose on the plain form (carried via pendingToken),
    // NOT anything from Microsoft's own profile — same principle as the
    // ms_signup flow below (Microsoft verifies, it doesn't get to dictate
    // the account's details).
    if (intent === "signup_verify") {
      if (!isDomainAllowed(email)) {
        return res.redirect(frontendRedirect("/register", { error: "domain_not_allowed" }));
      }
      const pending = consumeHandoff(pendingId, "pending_signup");
      if (!pending || pending.email !== email) {
        return res.redirect(frontendRedirect("/register", { error: "invalid_state" }));
      }

      // Re-check uniqueness — time has passed since startVerifiedSignup, and
      // this is the actual point of account creation, so this check (not
      // that one) is the one that has to be race-safe against a duplicate.
      const { data: existing, error: existErr } = await supabaseAdmin
        .from("users").select("user_id").eq("email", email).maybeSingle();
      if (existErr) throw existErr;
      if (existing) return res.redirect(frontendRedirect("/login", { error: "already_registered" }));
      if (!pending.student_id || await isStudentIdTaken(pending.student_id)) {
        return res.redirect(frontendRedirect("/register", { error: pending.student_id ? "student_id_taken" : "invalid_state" }));
      }

      const user_name = await uniqueUserNameFromEmail(email);
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          full_name: pending.full_name,
          email,
          user_name,
          student_id: pending.student_id,
          password_hash: pending.password_hash,
          microsoft_id: msId,
          microsoft_linked_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const code = issueHandoff("session", { token: signToken(newUser) });
      return res.redirect(frontendRedirect("/auth/callback", { code }));
    }

    let user = await findOrLinkUser({ msId, email });

    if (intent === "reset") {
      if (!user || user.status !== "active") {
        return res.redirect(frontendRedirect("/forgot-password", { error: user ? "inactive" : "no_account" }));
      }
      // Bound to the current password (pwv): usable once, see resetPassword.
      const resetToken = signPurposeToken(
        { user_id: user.user_id, purpose: "pwd_reset", pwv: passwordVersion(user.password_hash) }, "15m"
      );
      const code = issueHandoff("pwd_reset", { token: resetToken }, 5 * 60);
      return res.redirect(frontendRedirect("/reset-password", { code }));
    }

    // intent === "login", no existing account: Microsoft only verified the
    // email here, it doesn't get to create the account too. Hand off to a
    // real signup form so the person picks their own name and password.
    if (!user) {
      if (!isDomainAllowed(email)) {
        return res.redirect(frontendRedirect("/login", { error: "domain_not_allowed" }));
      }
      const signupToken = signPurposeToken({ msId, email, name, purpose: "ms_signup" }, "15m");
      const code = issueHandoff("ms_signup", { token: signupToken, email, name }, 5 * 60);
      return res.redirect(frontendRedirect("/complete-signup", { code }));
    }

    if (user.status !== "active") {
      return res.redirect(frontendRedirect("/login", { error: "inactive" }));
    }

    await supabaseAdmin.from("users").update({ last_login_at: new Date().toISOString() }).eq("user_id", user.user_id);
    const code = issueHandoff("session", { token: signToken(user) });
    return res.redirect(frontendRedirect("/auth/callback", { code }));
  } catch (err) {
    next(err);
  }
}

// Finishes the flow microsoftCallback started for a brand-new identity:
// Microsoft only proved the email is real, so full_name/password are the
// user's own choice, not Microsoft's claims. Plain JSON endpoint (not a
// redirect) since the frontend calls this directly from a form submit.
export async function microsoftCompleteSignup(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { token, full_name, password, student_id } = req.body;
    if (!full_name || !password || !student_id) {
      return res.status(400).json({ error: "full_name, password, and student_id are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: "This signup link is invalid or has expired" });
    }
    if (payload.purpose !== "ms_signup") {
      return res.status(401).json({ error: "This signup link is invalid or has expired" });
    }
    const { msId, email } = payload;

    // The token could in theory outlive a domain-policy change in its 15
    // minute window, so re-check rather than trust the token blindly.
    if (!isDomainAllowed(email)) {
      return res.status(403).json({ error: "That email isn't eligible to sign up here" });
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const trimmedStudentId = student_id.trim();
    if (await isStudentIdTaken(trimmedStudentId)) {
      return res.status(409).json({ error: "An account with this Student ID already exists" });
    }

    const user_name = await uniqueUserNameFromEmail(email);
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { data: user, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        full_name,
        email,
        user_name,
        password_hash,
        student_id: trimmedStudentId,
        microsoft_id: msId,
        microsoft_linked_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;

    setSessionCookie(res, signToken(user));
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}
