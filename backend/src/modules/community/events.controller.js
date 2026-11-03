import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { safeHttpUrl } from "../../shared/safeUrl.js";
import { normalizeRow } from "../../shared/normalizeTimestamps.js";
import { parsePagination } from "../../shared/pagination.js";

// Events used to go through the generic crudRouter (see community.routes.js
// history), but a gallery needs a real child table (event_images) that
// crudRouter can't read, write, or clean up on save; same reason
// collaboration_posts/community_posts got dedicated controllers. The image
// list is rewritten wholesale on every create/update (mirrors
// learning.controller.js's lessons handling), not diffed in place: the
// admin editor always submits the full ordered array.
const EVENT_SELECT = "*, event_images(image_url, sort_order)";

function toFrontendEvent(row) {
  if (!row) return row;
  const images = [...(row.event_images || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url);
  const { event_images, ...rest } = row;
  return normalizeRow({
    ...rest,
    // Legacy single-image column stays as the cover fallback for any row
    // that predates event_images (or was written outside this API).
    image_url: images[0] || rest.image_url || null,
    images: images.length ? images : rest.image_url ? [rest.image_url] : [],
  });
}

function toImageRows(eventId, images) {
  return (Array.isArray(images) ? images : [])
    .filter((url) => typeof url === "string" && url.trim())
    .map((url, i) => ({ event_id: eventId, image_url: url.trim(), sort_order: i }));
}

// Plain event columns only: images/event_id/created_at are handled
// separately, never taken from the client payload.
function toEventRow(payload) {
  const row = { ...payload };
  delete row.images;
  delete row.event_id;
  delete row.created_by;
  delete row.created_at;
  for (const col of ["registration_url", "gallery_url"]) {
    if (col in row) row[col] = safeHttpUrl(row[col]);
  }
  // Cover mirror for the legacy column, kept in sync so anything still
  // reading image_url directly (e.g. an un-migrated report/query) sees the
  // current cover image.
  row.image_url = Array.isArray(payload.images) && payload.images[0] ? payload.images[0].trim() : null;
  return row;
}

async function fetchEvent(eventId) {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select(EVENT_SELECT)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listEvents(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const pagination = parsePagination(req.query);
    let query = supabaseAdmin
      .from("events")
      .select(EVENT_SELECT, pagination ? { count: "exact" } : undefined)
      .order("start_date", { ascending: true });
    if (pagination) query = query.range(pagination.from, pagination.to);
    const { data, error, count } = await query;
    if (error) throw error;
    const body = { data: data.map(toFrontendEvent) };
    if (pagination) body.total = count;
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function getEvent(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const data = await fetchEvent(req.params.id);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json({ data: toFrontendEvent(data) });
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const row = { ...toEventRow(req.body), created_by: req.user.user_id };
    const { data: created, error } = await supabaseAdmin
      .from("events")
      .insert(row)
      .select("event_id")
      .single();
    if (error) throw error;

    const imageRows = toImageRows(created.event_id, req.body.images);
    if (imageRows.length) {
      const { error: imgErr } = await supabaseAdmin.from("event_images").insert(imageRows);
      if (imgErr) throw imgErr;
    }

    res.status(201).json({ data: toFrontendEvent(await fetchEvent(created.event_id)) });
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const eventId = req.params.id;
    const { error: updateErr } = await supabaseAdmin
      .from("events")
      .update(toEventRow(req.body))
      .eq("event_id", eventId);
    if (updateErr) throw updateErr;

    // The editor always submits the full image list, so replacing them
    // wholesale is simpler than diffing (same call as learning.controller.js
    // makes for lessons).
    if (Array.isArray(req.body.images)) {
      const { error: clearErr } = await supabaseAdmin.from("event_images").delete().eq("event_id", eventId);
      if (clearErr) throw clearErr;
      const imageRows = toImageRows(Number(eventId), req.body.images);
      if (imageRows.length) {
        const { error: imgErr } = await supabaseAdmin.from("event_images").insert(imageRows);
        if (imgErr) throw imgErr;
      }
    }

    const updated = await fetchEvent(eventId);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ data: toFrontendEvent(updated) });
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    // event_images cascades via FK; nothing extra to clean up here.
    const { error } = await supabaseAdmin.from("events").delete().eq("event_id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
