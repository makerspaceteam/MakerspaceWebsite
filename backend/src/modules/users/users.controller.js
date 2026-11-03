import bcrypt from "bcrypt";
import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { toPublicUser } from "../../shared/sanitizeUser.js";
import { safeHttpUrl } from "../../shared/safeUrl.js";
import { signToken } from "../../utils/jwt.js";
import { setSessionCookie } from "../../shared/session.js";
import { uniqueUserNameFromEmail } from "../../shared/userAccounts.js";
import { normalizeEmail, isStudentIdTaken } from "../auth/auth.controller.js";

const SALT_ROUNDS = 10;
const ASSIGNABLE_ROLES = ["admin", "staff", "user"];

export async function getMe(req, res) {
  res.json({ data: req.user });
}

// Self-service profile edit, deliberately narrow: name/phone/bio/avatar.
// Role/status/email aren't editable here (admin-controlled or identity-
// critical). student_id is the one exception: it can be set once, only if
// the account doesn't have one yet (accounts made before signup required
// it), and is locked after that since membership/inventory key off it.
export async function updateMe(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const payload = {};
    if (req.body.student_id !== undefined && !req.user.student_id) {
      const studentId = String(req.body.student_id).trim();
      if (studentId) {
        if (await isStudentIdTaken(studentId, req.user.user_id)) {
          return res.status(409).json({ error: "An account with this Student ID already exists" });
        }
        payload.student_id = studentId;
      }
    }
    if (req.body.full_name !== undefined) {
      const name = req.body.full_name.trim();
      if (!name) return res.status(400).json({ error: "Name can't be empty." });
      payload.full_name = name;
    }
    if (req.body.phone_number !== undefined) payload.phone_number = req.body.phone_number.trim() || null;
    if (req.body.bio !== undefined) payload.bio = req.body.bio.trim() || null;
    if (req.body.profile_img_url !== undefined) payload.profile_img_url = safeHttpUrl(req.body.profile_img_url);

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(payload)
      .eq("user_id", req.user.user_id)
      .select("*")
      .single();
    if (error) throw error;
    res.json({ data: toPublicUser(data) });
  } catch (err) {
    next(err);
  }
}

// Self-service password change: requires the current password (not just
// being logged in), so a session left open on a shared/unlocked device
// can't be used to lock the real owner out by changing it to something
// unknown.
export async function changeMyPassword(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "current_password and new_password are required" });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const { data: user, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("password_hash")
      .eq("user_id", req.user.user_id)
      .single();
    if (lookupError) throw lookupError;

    const matches = await bcrypt.compare(current_password, user.password_hash);
    if (!matches) return res.status(401).json({ error: "Current password is incorrect" });

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ password_hash })
      .eq("user_id", req.user.user_id);
    if (updateError) throw updateError;

    // The new password invalidates every existing session (pwv in the JWT),
    // including this one, so hand this browser a fresh cookie. Other devices
    // are signed out.
    setSessionCookie(res, signToken({ ...req.user, password_hash }));
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

// Multipart upload, same pattern as event-images/achievement-icons: buffer
// straight to Supabase Storage, return the public URL for the edit form to
// save as profile_img_url via updateMe above.
export async function uploadMyAvatar(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided (field name: avatar)" });
    const ext = (req.file.originalname.match(/\.\w+$/) || [".jpg"])[0].toLowerCase();
    const path = `avatars/${req.user.user_id}-${Date.now()}${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("user-avatars")
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) throw upErr;

    const { data } = supabaseAdmin.storage.from("user-avatars").getPublicUrl(path);
    res.status(201).json({ data: { url: data.publicUrl } });
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin.from("users").select("*");
    if (error) throw error;
    res.json({ data: data.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
}

// Admin/staff creating an account on someone's behalf, separate from public
// self-signup (auth.controller.js), which always creates a plain "user".
// Role is admin-only: a staff-issued request is silently forced to "user"
// regardless of what's in the body, so a staff account can never mint
// itself (or anyone else) admin/staff access.
export async function createUser(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { full_name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!full_name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "full_name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    const role = req.user.role === "admin" && ASSIGNABLE_ROLES.includes(req.body.role)
      ? req.body.role
      : "user";

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user_name = await uniqueUserNameFromEmail(normalizedEmail);
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({ full_name, email: normalizedEmail, user_name, password_hash, role })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json({ data: toPublicUser(data) });
  } catch (err) {
    next(err);
  }
}

// Suspend/reactivate: requireAuth already rejects a suspended account's
// own token on every subsequent request (see requireAuth.js), so toggling
// this is immediately effective, no separate enforcement needed here.
export async function setUserStatus(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const status = req.body.status;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
    }
    const targetId = Number(req.params.id);
    if (targetId === req.user.user_id) {
      return res.status(400).json({ error: "You can't change your own account status." });
    }
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("users").select("role").eq("user_id", targetId).maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return res.status(404).json({ error: "User not found" });
    // Staff may manage regular accounts only; admin/staff accounts are
    // admin-managed, so a staff account can't lock out an admin.
    if (req.user.role !== "admin" && ["admin", "staff"].includes(target.role)) {
      return res.status(403).json({ error: "Only an admin can change the status of admin or staff accounts" });
    }
    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ status })
      .eq("user_id", targetId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "User not found" });
    res.json({ data: toPublicUser(data) });
  } catch (err) {
    next(err);
  }
}
