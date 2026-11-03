import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { normalizeRow } from "../../shared/normalizeTimestamps.js";
import { resolveTagIds } from "../../shared/tagResolver.js";
import { parsePagination } from "../../shared/pagination.js";

// collaboration_posts has real child tables for its list fields:
// collaboration_roles (one row per role) and collaboration_skills, a join
// table into the shared `tags` dictionary (also used by post_tags/event_tags).
// crudRouter (community.routes.js) only does single-table CRUD, so list/
// detail/create/delete for this resource get their own handlers here.
// Update isn't offered anywhere in the UI (admin only views/deletes other
// people's posts, see AdminCollaboration.jsx), so it's the one verb still
// left to crudRouter.
const MODERATOR_ROLES = ["admin", "staff"];
const SELECT_WITH_RELATIONS =
  "*, author:users!user_id(user_id, full_name, user_name, profile_img_url), " +
  "collaboration_roles(role_name), collaboration_skills(tags(tag_name))";

function flattenRelations(row) {
  if (!row) return row;
  const roles_needed = (row.collaboration_roles || []).map(r => r.role_name);
  const skills = (row.collaboration_skills || []).map(s => s.tags?.tag_name).filter(Boolean);
  const { collaboration_roles, collaboration_skills, ...rest } = row;
  return normalizeRow({ ...rest, roles_needed, skills });
}

export async function listCollabPosts(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const pagination = parsePagination(req.query);
    let query = supabaseAdmin
      .from("collaboration_posts")
      .select(SELECT_WITH_RELATIONS, pagination ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false });
    if (pagination) query = query.range(pagination.from, pagination.to);
    const { data, error, count } = await query;
    if (error) throw error;
    const body = { data: data.map(flattenRelations) };
    if (pagination) body.total = count;
    res.json(body);
  } catch (err) {
    next(err);
  }
}

// The Profile page's "My Content" section needs the caller's own posts
// regardless of status (open + closed), unlike the public feed which only
// ever needs pagination - no page/limit here, just everything they own.
export async function listMyCollabPosts(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("collaboration_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("user_id", req.user.user_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data.map(flattenRelations) });
  } catch (err) {
    next(err);
  }
}

export async function getCollabPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("collaboration_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("collab_id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json({ data: flattenRelations(data) });
  } catch (err) {
    next(err);
  }
}

// Skills are deduped against the shared `tags` table (via resolveTagIds in
// tagResolver.js) instead of inserted fresh every time, so the same skill
// typed on different posts collapses to one tag row, same helper post_tags
// uses for community posts.
export const COLLAB_WRITABLE = [
  "project_title", "category", "short_pitch", "description", "post_type",
  "team_size_current", "team_size_target", "contact_email", "contact_discord",
  "contact_telegram", "status",
];

export async function createCollabPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { roles_needed, skills } = req.body;
    // Only these columns come from the client; ids/timestamps/owner are server-set.
    const postFields = Object.fromEntries(COLLAB_WRITABLE.filter((f) => req.body[f] !== undefined).map((f) => [f, req.body[f]]));
    const roleNames = Array.isArray(roles_needed) ? [...new Set(roles_needed.filter((r) => typeof r === "string").map(r => r.trim()).filter(Boolean))].slice(0, 20) : [];
    const skillNames = (Array.isArray(skills) ? skills : []).filter((t) => typeof t === "string").slice(0, 20);

    const { data: post, error: postErr } = await supabaseAdmin
      .from("collaboration_posts")
      .insert({ ...postFields, user_id: req.user.user_id })
      .select("collab_id")
      .single();
    if (postErr) throw postErr;

    if (roleNames.length) {
      const { error: rolesErr } = await supabaseAdmin
        .from("collaboration_roles")
        .insert(roleNames.map(role_name => ({ collab_id: post.collab_id, role_name })));
      if (rolesErr) throw rolesErr;
    }

    if (skillNames.length) {
      const tagIds = await resolveTagIds(skillNames);
      const { error: skillsErr } = await supabaseAdmin
        .from("collaboration_skills")
        .insert(tagIds.map(tag_id => ({ collab_id: post.collab_id, tag_id })));
      if (skillsErr) throw skillsErr;
    }

    const { data: full, error: fetchErr } = await supabaseAdmin
      .from("collaboration_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("collab_id", post.collab_id)
      .single();
    if (fetchErr) throw fetchErr;

    res.status(201).json({ data: flattenRelations(full) });
  } catch (err) {
    next(err);
  }
}

// Explicitly clears collaboration_roles/collaboration_skills before removing
// the post, rather than assuming the live FK constraints cascade. Cheap
// either way, and avoids a possible FK-violation error (or silently
// orphaned rows) if they don't. Doesn't touch `tags` itself: those are
// shared with post_tags/event_tags, so a tag stays even if this was its
// last use.
export async function deleteCollabPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data: post, error: findErr } = await supabaseAdmin
      .from("collaboration_posts").select("user_id").eq("collab_id", req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!post) return res.status(404).json({ error: "Not found" });
    if (!MODERATOR_ROLES.includes(req.user.role) && post.user_id !== req.user.user_id) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { error: rolesErr } = await supabaseAdmin.from("collaboration_roles").delete().eq("collab_id", req.params.id);
    if (rolesErr) throw rolesErr;
    const { error: skillsErr } = await supabaseAdmin.from("collaboration_skills").delete().eq("collab_id", req.params.id);
    if (skillsErr) throw skillsErr;

    const { error: delErr } = await supabaseAdmin.from("collaboration_posts").delete().eq("collab_id", req.params.id);
    if (delErr) throw delErr;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
