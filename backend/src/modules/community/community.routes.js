import { Router } from "express";
import { createCrudRouter } from "../../shared/crudRouter.js";
import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { requireAuth, requireRole } from "../../middleware/requireAuth.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import eventRegistrationsRoutes from "./eventRegistrations.routes.js";
import { imageUpload as upload } from "../../shared/imageUpload.js";
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent } from "./events.controller.js";
import { listCollabPosts, getCollabPost, createCollabPost, deleteCollabPost, listMyCollabPosts, COLLAB_WRITABLE } from "./collaboration.controller.js";
import { listCommunityPosts, getCommunityPost, createCommunityPost, deleteCommunityPost, toggleLike, createComment, listMyCommunityPosts } from "./communityPost.controller.js";


const router = Router();

// Registration routes first: action-based, own their own auth per route.
// Mounting order doesn't strictly matter (every path here is 2+ segments
// past /events, the generic router below only owns single-segment /:id),
// but this keeps the more specific routes visually in front.
router.use("/events", eventRegistrationsRoutes);

// Event photo upload: admin/staff only, multipart field "image", returns
// { url }. Same shape as inventory's item-image upload (see
// inventory.controller.js's uploadItemImage): multer buffers it in memory,
// we push it straight to Supabase Storage, no local disk involved.
router.post("/events/upload-image", requireAuth, requireRole("admin", "staff"), upload.single("image"), async (req, res, next) => {
  if (!assertSupabaseConfigured(res)) return;
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided (field name: image)" });
    const ext = (req.file.originalname.match(/\.\w+$/) || [".jpg"])[0].toLowerCase();
    const path = `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("event-images")
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) throw upErr;

    const { data } = supabaseAdmin.storage.from("event-images").getPublicUrl(path);
    res.status(201).json({ data: { url: data.publicUrl } });
  } catch (err) {
    next(err);
  }
});
// Events are admin/staff-owned; everyone else (including logged-in
// students) gets read-only access; writes require the admin panel. Events
// have a real child table (event_images, for the gallery) that crudRouter
// can't read/write/clean up, so, like collaborations/posts below, list/
// detail/create/update/delete all get dedicated handlers (events.controller.js).
router.get("/events", listEvents);
router.get("/events/:id", getEvent);
router.post("/events", requireAuth, requireRole("admin", "staff"), createEvent);
router.put("/events/:id", requireAuth, requireRole("admin", "staff"), updateEvent);
router.delete("/events/:id", requireAuth, requireRole("admin", "staff"), deleteEvent);
// Collaboration posts have real child tables for roles/skills
// (collaboration_roles, collaboration_skills+tags) that crudRouter can't
// read, write, or clean up on delete; list/detail/create/delete get
// dedicated handlers (collaboration.controller.js) registered ahead of the
// generic router. Update isn't used anywhere in the UI, so it's the one
// verb still left to crudRouter.
router.get("/collaborations", listCollabPosts);
// Ahead of /collaborations/:id so "mine" isn't swallowed as a collab_id.
router.get("/collaborations/mine", requireAuth, listMyCollabPosts);
router.get("/collaborations/:id", getCollabPost);
router.post("/collaborations", requireAuth, createCollabPost);
router.delete("/collaborations/:id", requireAuth, deleteCollabPost);
// Both are feeds, not catalogs: newest first, like any social feed.
router.use("/collaborations", createCrudRouter("collaboration_posts", { pkColumn: "collab_id", ownerField: "user_id", writableFields: COLLAB_WRITABLE, embedAuthor: true, orderBy: { column: "created_at", ascending: false } }));

// Shared tag dictionary (post_tags/event_tags/collaboration_skills all point
// here); backs the skills typeahead on Find Team's create form, so people
// see "React" already exists instead of typing "react.js" as a near-dupe.
// Public/read-only, same as every other list endpoint.
router.get("/tags", async (req, res, next) => {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const q = (req.query.q || "").trim();
    let query = supabaseAdmin.from("tags").select("tag_id, tag_name").order("tag_name").limit(20);
    if (q) query = query.ilike("tag_name", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
// Community posts have a real child table for tags (post_tags+tags) that
// crudRouter can't read, write, or clean up on delete; same treatment as
// collaborations above. Update isn't used anywhere in the UI, so it's the
// one verb still left to crudRouter.
//
// GET routes use optionalAuth (not requireAuth); the feed stays public for
// guests, optionalAuth just attaches req.user when a token IS present so
// the handler can compute "did I already like this" per viewer.
router.get("/posts", optionalAuth, listCommunityPosts);
// Ahead of /posts/:id so "mine" isn't swallowed as a post_id.
router.get("/posts/mine", requireAuth, listMyCommunityPosts);
router.get("/posts/:id", optionalAuth, getCommunityPost);
router.post("/posts", requireAuth, createCommunityPost);
router.delete("/posts/:id", requireAuth, deleteCommunityPost);
router.post("/posts/:id/like", requireAuth, toggleLike);
router.post("/posts/:id/comments", requireAuth, createComment);
router.use("/posts", createCrudRouter("community_posts", { pkColumn: "post_id", ownerField: "user_id", writableFields: ["title", "content", "category"],
  // Same rule as createCommunityPost: only staff may post as "Announcement",
  // so an owner can't edit their post's category into one either.
  validateWrite: (req, payload) =>
    String(payload.category || "").trim().toLowerCase() === "announcement" && !["admin", "staff"].includes(req.user.role)
      ? { status: 403, error: "Only staff can post announcements." }
      : null, embedAuthor: true, orderBy: { column: "created_at", ascending: false } }));

export default router;
