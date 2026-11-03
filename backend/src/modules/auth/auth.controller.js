import bcrypt from "bcrypt";
import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { signToken, verifyToken, passwordVersion } from "../../utils/jwt.js";
import { setSessionCookie, clearSessionCookie } from "../../shared/session.js";
import { issueHandoff, consumeHandoff } from "../../shared/handoff.js";
import { toPublicUser } from "../../shared/sanitizeUser.js";

const SALT_ROUNDS = 10;

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Comma-separated domains; subdomains count (cadt.edu.kh admits
// student.cadt.edu.kh too). Shared with microsoft.controller.js's OAuth
// signup gate — a Microsoft-verified email and a plain-form email go
// through the exact same domain check, since only that (not the sign-in
// method) is what actually stops a Gmail address from registering here.
export function isDomainAllowed(email) {
  const allowedDomains = (process.env.MICROSOFT_ALLOWED_EMAIL_DOMAIN || "")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (allowedDomains.length === 0) return true;
  const emailDomain = email.split("@")[1] || "";
  return allowedDomains.some((d) => emailDomain === d || emailDomain.endsWith(`.${d}`));
}

// student_id is UNIQUE in the DB; checked up front so the person gets a
// readable 409 instead of a raw constraint error. Shared by every place an
// account can get a student ID (both signup flows and the profile edit).
export async function isStudentIdTaken(studentId, exceptUserId) {
  let query = supabaseAdmin.from("users").select("user_id").eq("student_id", studentId);
  if (exceptUserId) query = query.neq("user_id", exceptUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// Step 1 of "verify with Microsoft" sign-up: validates the form and hashes
// the password, but does NOT create the account yet — that only happens
// once the person actually proves they own this exact email by logging
// into it via Microsoft (see microsoft.controller.js's "signup_verify"
// intent). The pending signup (name/email/password hash) travels through
// that Microsoft round trip as a short-lived signed token rather than
// anything saved server-side, the same way the OAuth `state` param already
// carries data through a redirect elsewhere in this codebase.
export async function startVerifiedSignup(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { full_name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const student_id = String(req.body.student_id || "").trim();
    if (!full_name || !normalizedEmail || !password || !student_id) {
      return res.status(400).json({ error: "full_name, email, password, and student_id are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!isDomainAllowed(normalizedEmail)) {
      return res.status(403).json({ error: "Sign up with your CADT email address (e.g. @cadt.edu.kh)." });
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });
    if (await isStudentIdTaken(student_id)) {
      return res.status(409).json({ error: "An account with this Student ID already exists" });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    // Kept server-side: only an opaque one-time id travels through the
    // Microsoft redirect, so the password hash never appears in a URL, in
    // the OAuth state sent to Microsoft, or in any access log.
    const pendingId = issueHandoff(
      "pending_signup",
      { full_name, email: normalizedEmail, student_id, password_hash },
      15 * 60
    );
    res.json({ pendingId });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: "Invalid email or password" });
    if (user.status !== "active") return res.status(403).json({ error: "This account is inactive" });

    await supabaseAdmin.from("users").update({ last_login_at: new Date().toISOString() }).eq("user_id", user.user_id);

    setSessionCookie(res, signToken(user));
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

// Step 1 of forgot-password: the user types their email and we confirm an
// account exists before sending them to Microsoft to prove they own it.
export async function forgotPasswordCheck(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    // Same answer whether or not an account exists, so this endpoint can't
    // be used to discover who is registered. Whether the account exists is
    // only revealed after the person proves they own the mailbox by signing
    // in to Microsoft as it (see microsoftCallback's "reset" intent).
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Completes the Microsoft-verified password-reset flow: the caller already
// proved their identity to get this token (see microsoft.controller.js), so
// on success we sign them straight back in rather than sending them to /login.
export async function resetPassword(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "token and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: "This reset link is invalid or has expired" });
    }
    if (payload.purpose !== "pwd_reset") {
      return res.status(401).json({ error: "This reset link is invalid or has expired" });
    }
    // Single use: the token is bound to the password it was issued against.
    // Once any password change happens, this (and every other) reset token
    // for the account stops working.
    const { data: current, error: currentErr } = await supabaseAdmin
      .from("users").select("password_hash, status").eq("user_id", payload.user_id).maybeSingle();
    if (currentErr) throw currentErr;
    if (!current || current.status !== "active" || payload.pwv !== passwordVersion(current.password_hash)) {
      return res.status(401).json({ error: "This reset link is invalid or has already been used" });
    }

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({ password_hash })
      .eq("user_id", payload.user_id)
      .select()
      .single();
    if (error) throw error;
    if (!user) return res.status(401).json({ error: "Account no longer exists" });

    setSessionCookie(res, signToken(user));
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

// Swaps a one-time handoff code (from a Microsoft redirect) for what it
// stands for. kind=session also signs the browser in via the HttpOnly cookie.
const EXCHANGE_KINDS = ["session", "pwd_reset", "ms_signup"];
export async function exchangeHandoff(req, res, next) {
  try {
    const { code, kind } = req.body || {};
    if (!EXCHANGE_KINDS.includes(kind)) return res.status(400).json({ error: "Invalid kind" });
    const payload = consumeHandoff(code, kind);
    if (!payload) return res.status(401).json({ error: "This link is invalid or has expired. Please start again." });

    if (kind === "session") {
      setSessionCookie(res, payload.token);
      return res.json({ ok: true });
    }
    // pwd_reset: { token }   ms_signup: { token, email, name }
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}
