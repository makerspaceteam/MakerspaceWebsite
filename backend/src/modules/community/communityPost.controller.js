import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { normalizeRow } from "../../shared/normalizeTimestamps.js";
import { resolveTagIds } from "../../shared/tagResolver.js";
import { parsePagination } from "../../shared/pagination.js";

// community_posts has a real child table for tags: post_tags, a join table
// into the shared `tags` dictionary (the same table collaboration_skills/
// event_tags use). crudRouter only does single-table CRUD, so list/detail/
// create/delete get dedicated handlers here, mirroring collaboration.
// controller.js. Update isn't offered anywhere in the UI (admin only views/
// deletes other people's posts (see AdminCommunity.jsx), so it's the one
// verb still left to crudRouter.
const MODERATOR_ROLES = ["admin", "staff"];
const AUTHOR_COLS = "user_id, full_name, user_name, profile_img_url";
const SELECT_WITH_RELATIONS =
  `*, author:users!user_id(${AUTHOR_COLS}), post_tags(tags(tag_name)), ` +
  `post_comments(comment_id, content, created_at, author:users!user_id(${AUTHOR_COLS}))`;

// comments come through raw (comment_id/content/created_at + nested author)
// rather than remapped here, matching how `tags`/top-level `author` are
// already left for the frontend's mapPost/mapComment to rename into
// camelCase; this backend layer doesn't do field renaming elsewhere either.
function flattenRelations(row) {
  if (!row) return row;
  const tags = (row.post_tags || []).map(t => t.tags?.tag_name).filter(Boolean);
  const comments = (row.post_comments || []).slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const { post_tags, post_comments, ...rest } = row;
  return normalizeRow({ ...rest, tags, comments, likes: 0, liked_by_me: false });
}

// Batched into 1 round trip for the whole list rather than a per-post
// count query: fetches every vote row for the given posts once, then
// tallies counts and "did the current viewer vote" in memory. currentUserId
// is undefined for anonymous viewers (optionalAuth doesn't reject them),
// in which case liked_by_me is just always false.
async function attachVotes(posts, currentUserId) {
  if (!posts.length) return posts;
  const { data: votes, error } = await supabaseAdmin
    .from("post_votes").select("post_id, user_id").in("post_id", posts.map(p => p.post_id));
  if (error) throw error;

  const countByPost = new Map();
  const likedByMe = new Set();
  for (const v of votes) {
    countByPost.set(v.post_id, (countByPost.get(v.post_id) || 0) + 1);
    if (currentUserId && v.user_id === currentUserId) likedByMe.add(v.post_id);
  }
  for (const post of posts) {
    post.likes = countByPost.get(post.post_id) || 0;
    post.liked_by_me = likedByMe.has(post.post_id);
  }
  return posts;
}

export async function listCommunityPosts(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const pagination = parsePagination(req.query);
    let query = supabaseAdmin
      .from("community_posts")
      .select(SELECT_WITH_RELATIONS, pagination ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false });
    if (pagination) query = query.range(pagination.from, pagination.to);
    const { data, error, count } = await query;
    if (error) throw error;
    const posts = await attachVotes(data.map(flattenRelations), req.user?.user_id);
    const body = { data: posts };
    if (pagination) body.total = count;
    res.json(body);
  } catch (err) {
    next(err);
  }
}

// Mirrors listMyCollabPosts (collaboration.controller.js): the Profile
// page's "My Content" section needs everything the caller has posted, no
// pagination needed since it's scoped to one user.
export async function listMyCommunityPosts(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("community_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("user_id", req.user.user_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const posts = await attachVotes(data.map(flattenRelations), req.user.user_id);
    res.json({ data: posts });
  } catch (err) {
    next(err);
  }
}

export async function getCommunityPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("community_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("post_id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    const [post] = await attachVotes([flattenRelations(data)], req.user?.user_id);
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
}

// Toggles the current user's vote on a post: one row per (post_id,
// user_id) in post_votes means "voted", no row means "didn't." vote_type is
// CHECK-constrained to 'upvote'/'downvote' (a fuller up/down voting system
// than what's built); the UI only has a single Heart button, so every row
// is 'upvote'. Confirmed against System_Full_DB.sql's CREATE TABLE after
// "like" (not a valid value) got rejected with a 500 in testing.
export async function toggleLike(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const postId = req.params.id;
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("post_votes").select("vote_id").eq("post_id", postId).eq("user_id", req.user.user_id).maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      const { error: delErr } = await supabaseAdmin.from("post_votes").delete().eq("vote_id", existing.vote_id);
      if (delErr) throw delErr;
    } else {
      const { error: insErr } = await supabaseAdmin
        .from("post_votes").insert({ post_id: postId, user_id: req.user.user_id, vote_type: "upvote" });
      if (insErr) throw insErr;
    }

    const { count, error: countErr } = await supabaseAdmin
      .from("post_votes").select("*", { count: "exact", head: true }).eq("post_id", postId);
    if (countErr) throw countErr;

    res.json({ data: { likes: count ?? 0, liked_by_me: !existing } });
  } catch (err) {
    next(err);
  }
}

export async function createCommunityPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { tags } = req.body;
    // Only these columns come from the client; ids/timestamps/owner are server-set.
    const postFields = {
      title: req.body.title,
      content: req.body.content,
      category: req.body.category,
    };
    const tagNames = (Array.isArray(tags) ? tags : []).filter((t) => typeof t === "string").slice(0, 20);

    // "Announcement" is the makerspace's own voice, so only staff/admin can
    // post it; the frontend hides the option from everyone else, but that
    // alone doesn't stop a hand-made request.
    if (
      String(postFields.category || "").trim().toLowerCase() === "announcement" &&
      !MODERATOR_ROLES.includes(req.user.role)
    ) {
      return res.status(403).json({ error: "Only staff can post announcements." });
    }

    const { data: post, error: postErr } = await supabaseAdmin
      .from("community_posts")
      .insert({ ...postFields, user_id: req.user.user_id })
      .select("post_id")
      .single();
    if (postErr) throw postErr;

    if (tagNames.length) {
      const tagIds = await resolveTagIds(tagNames);
      const { error: tagsErr } = await supabaseAdmin
        .from("post_tags")
        .insert(tagIds.map(tag_id => ({ post_id: post.post_id, tag_id })));
      if (tagsErr) throw tagsErr;
    }

    const { data: full, error: fetchErr } = await supabaseAdmin
      .from("community_posts")
      .select(SELECT_WITH_RELATIONS)
      .eq("post_id", post.post_id)
      .single();
    if (fetchErr) throw fetchErr;

    res.status(201).json({ data: flattenRelations(full) });
  } catch (err) {
    next(err);
  }
}

// post_comments has no CHECK constraints to trip over (unlike post_votes'
// vote_type), confirmed against System_Full_DB.sql; just post_id/user_id/
// content, content NOT NULL.
export async function createComment(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const content = (req.body.content || "").trim();
    if (!content) return res.status(400).json({ error: "Comment can't be empty." });

    const { data, error } = await supabaseAdmin
      .from("post_comments")
      .insert({ post_id: req.params.id, user_id: req.user.user_id, content })
      .select(`comment_id, content, created_at, author:users!user_id(${AUTHOR_COLS})`)
      .single();
    if (error) throw error;

    res.status(201).json({ data: normalizeRow(data) });
  } catch (err) {
    next(err);
  }
}

// Explicitly clears post_tags/post_votes/post_comments before removing the
// post, rather than assuming the live FK constraints cascade; confirmed
// necessary for the equivalent collaboration_posts delete
// (deleteCollabPost), so treated as necessary here too. Doesn't touch
// `tags` itself: shared with collaboration_skills/event_tags, so a tag
// stays even if this was its last use.
export async function deleteCommunityPost(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data: post, error: findErr } = await supabaseAdmin
      .from("community_posts").select("user_id").eq("post_id", req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!post) return res.status(404).json({ error: "Not found" });
    if (!MODERATOR_ROLES.includes(req.user.role) && post.user_id !== req.user.user_id) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { error: tagsErr } = await supabaseAdmin.from("post_tags").delete().eq("post_id", req.params.id);
    if (tagsErr) throw tagsErr;
    const { error: votesErr } = await supabaseAdmin.from("post_votes").delete().eq("post_id", req.params.id);
    if (votesErr) throw votesErr;
    const { error: commentsErr } = await supabaseAdmin.from("post_comments").delete().eq("post_id", req.params.id);
    if (commentsErr) throw commentsErr;

    const { error: delErr } = await supabaseAdmin.from("community_posts").delete().eq("post_id", req.params.id);
    if (delErr) throw delErr;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
