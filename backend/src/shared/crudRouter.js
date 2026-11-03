import { Router } from "express";
import { supabaseAdmin, assertSupabaseConfigured } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { normalizeRow } from "./normalizeTimestamps.js";
import { parsePagination } from "./pagination.js";

// Generic REST router for a single table. These tables have RLS enabled
// with no anon policy (same as `courses`; see learning.controller.js), so
// both reads and writes go through the service-role client. The API itself
// is the trust boundary: GET stays open to anyone, writes are gated by our
// own requireAuth/requireRole/ownership checks below; there's no per-user
// Supabase session to scope RLS to anyway.
//
// pkColumn: this schema doesn't use a uniform "id" column (events use
// event_id, posts use post_id, etc.), so callers must say which one applies.
// ownerField: if set, that column is stamped with req.user.user_id on
// create, overriding anything the caller sent (e.g. "user_id" on
// community_posts, which is NOT NULL). It also scopes who may update/delete
// an existing row: the row's owner, or a moderatorRoles user. Anyone else
// gets 403, even though they're authenticated.
// writeRoles: if set, only these roles may create/update/delete at all (e.g.
// events are admin/staff-owned, everyone else gets read-only). Omit for
// tables like community_posts where any logged-in user may create their own,
// and ownership (not role) governs who can change a given row.
// moderatorRoles: roles that can update/delete any row regardless of
// ownership (default admin/staff). Only relevant when ownerField is set and
// writeRoles isn't.
// embedAuthor: if true, every row comes back with an `author` object
// ({ user_id, full_name, user_name, profile_img_url }) embedded via the
// ownerField's FK to `users`, so the frontend can show who actually posted
// instead of a placeholder. Requires ownerField to be a real FK to users.
// writableFields: if set, POST/PUT bodies are reduced to exactly these
// columns, so a caller can't set server-managed columns (created_at, ids,
// counters, ownership) by adding them to the JSON.
// validateWrite: optional (req, payload) => null | { status, error } run on
// updates after field filtering, for table-specific rules (e.g. who may set
// a category).
// orderBy: { column, ascending } applied to the list endpoint (GET /).
// Without it, row order is whatever Postgres feels like, which isn't a
// contract worth relying on. Omit for tables where the frontend does its
// own sorting/filtering (e.g. events, sorted by start_date client-side).
export function createCrudRouter(table, { pkColumn = "id", ownerField, writeRoles, moderatorRoles = ["admin", "staff"], embedAuthor = false, orderBy, writableFields, validateWrite } = {}) {
  const router = Router();
  const pickWritable = (body) => {
    const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    if (!writableFields) return { ...src };
    return Object.fromEntries(writableFields.filter((f) => src[f] !== undefined).map((f) => [f, src[f]]));
  };
  const guardCreate = writeRoles ? [requireAuth, requireRole(...writeRoles)] : [requireAuth];
  const selectClause = embedAuthor
    ? `*, author:users!${ownerField}(user_id, full_name, user_name, profile_img_url)`
    : "*";

  // For owned tables, only the row's creator or a moderator may modify it.
  // Fetched fresh per-request since ownership isn't derivable from the URL.
  async function requireOwnerOrModerator(req, res, next) {
    if (moderatorRoles.includes(req.user.role)) return next();
    try {
      const { data, error } = await supabaseAdmin.from(table).select(ownerField).eq(pkColumn, req.params.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Not found" });
      if (data[ownerField] !== req.user.user_id) return res.status(403).json({ error: "Insufficient permissions" });
      next();
    } catch (err) {
      next(err);
    }
  }

  const guardModify = writeRoles
    ? [requireAuth, requireRole(...writeRoles)]
    : ownerField
      ? [requireAuth, requireOwnerOrModerator]
      : [requireAuth];

  router.get("/", async (req, res, next) => {
    if (!assertSupabaseConfigured(res)) return;
    try {
      const pagination = parsePagination(req.query);
      let query = supabaseAdmin.from(table).select(selectClause, pagination ? { count: "exact" } : undefined);
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      if (pagination) query = query.range(pagination.from, pagination.to);
      const { data, error, count } = await query;
      if (error) throw error;
      const body = { data: data.map(normalizeRow) };
      if (pagination) body.total = count;
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    if (!assertSupabaseConfigured(res)) return;
    try {
      const { data, error } = await supabaseAdmin.from(table).select(selectClause).eq(pkColumn, req.params.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Not found" });
      res.json({ data: normalizeRow(data) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", ...guardCreate, async (req, res, next) => {
    try {
      const payload = pickWritable(req.body);
      if (ownerField) payload[ownerField] = req.user.user_id;
      const { data, error } = await supabaseAdmin.from(table).insert(payload).select(selectClause).single();
      if (error) throw error;
      res.status(201).json({ data: normalizeRow(data) });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", ...guardModify, async (req, res, next) => {
    try {
      // Ownership is fixed at creation. Never let an update payload hand a
      // row off to a different owner.
      const payload = pickWritable(req.body);
      if (ownerField) delete payload[ownerField];
      delete payload[pkColumn];
      if (Object.keys(payload).length === 0) return res.status(400).json({ error: "No updatable fields provided" });
      const problem = validateWrite?.(req, payload);
      if (problem) return res.status(problem.status || 400).json({ error: problem.error });
      const { data, error } = await supabaseAdmin.from(table).update(payload).eq(pkColumn, req.params.id).select(selectClause).single();
      if (error) throw error;
      res.json({ data: normalizeRow(data) });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", ...guardModify, async (req, res, next) => {
    try {
      const { error } = await supabaseAdmin.from(table).delete().eq(pkColumn, req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
