import { api, authFetch, BASE_URL } from "./api/client";

// Real events (from the `events` table) don't carry a tag list or a
// per-event organizer profile yet. Those need their own tables/routes we
// haven't built. Fall back to something reasonable instead of leaving the
// existing card/detail UI with blank images and an empty author card.
export const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop";
const PLACEHOLDER_AUTHOR = { name: "Community Team", role: "Event Organizer", avatar: "https://i.pravatar.cc/120?img=68" };

// countsById is the { [event_id]: count } map from /registrations/counts,
// passed in so a single bulk fetch covers every card instead of N calls.
function mapEvent(row, countsById = {}) {
  const images = row.images?.length ? row.images : row.image_url ? [row.image_url] : [PLACEHOLDER_IMAGE];
  return {
    id: row.event_id,
    image: images[0],
    images,
    registrationUrl: row.registration_url || null,
    galleryUrl: row.gallery_url || null,
    title: row.title,
    date: row.start_date,
    endDate: row.end_date,
    location: row.location || "TBA",
    participants: countsById[row.event_id] ?? 0,
    capacity: row.max_participants || 0,
    shortDescription: row.description
      ? row.description.length > 140 ? `${row.description.slice(0, 140)}…` : row.description
      : "",
    description: row.description || "",
    tags: [],
    status: row.status,
    author: PLACEHOLDER_AUTHOR,
  };
}

export async function fetchEvents() {
  const [{ data }, counts] = await Promise.all([
    api.get("/api/community/events"),
    fetchEventRegistrationCounts(),
  ]);
  return data.map((row) => mapEvent(row, counts));
}

// Paginated variant for the Events list page, so a growing events table
// doesn't mean downloading every row on every visit. fetchEvents() above
// stays full-list for HomePage, which needs everything in memory for search.
export async function fetchEventsPage({ page = 1, limit = 12 } = {}) {
  const [{ data, total }, counts] = await Promise.all([
    api.get(`/api/community/events?page=${page}&limit=${limit}`),
    fetchEventRegistrationCounts(),
  ]);
  return { events: data.map((row) => mapEvent(row, counts)), total };
}

export async function fetchEventById(id) {
  const [{ data }, counts] = await Promise.all([
    api.get(`/api/community/events/${id}`),
    fetchEventRegistrationCounts(),
  ]);
  return mapEvent(data, counts);
}

export async function createEvent(payload) {
  const { data } = await api.post("/api/community/events", payload);
  return mapEvent(data);
}

export async function updateEvent(id, payload) {
  const { data } = await api.put(`/api/community/events/${id}`, payload);
  return mapEvent(data);
}

export async function deleteEvent(id) {
  await api.del(`/api/community/events/${id}`);
}

// Multipart upload: the JSON client can't carry files, so this goes through
// fetch directly with the same bearer token. Returns the public image URL
// (same pattern as inventory's uploadItemImage).
export async function uploadEventImage(file) {
  const form = new FormData();
  form.append("image", file);
  const res = await authFetch(`/api/community/events/upload-image`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.data.url;
}

// { [event_id]: count } across every event. One call covers every card, no
// per-event round trip. Public, no PII.
export async function fetchEventRegistrationCounts() {
  const { data } = await api.get("/api/community/events/registrations/counts");
  return data;
}

// event_ids the current user is actively registered for.
export async function fetchMyEventRegistrations() {
  const { data } = await api.get("/api/community/events/registrations/me");
  return data;
}

// Full event objects (not just ids) for the Profile page's "My Content"
// section - joins fetchMyEventRegistrations' bare ids against the full
// events list since /registrations/me doesn't embed event details itself.
export async function fetchMyRegisteredEvents() {
  const [ids, events] = await Promise.all([fetchMyEventRegistrations(), fetchEvents()]);
  const idSet = new Set(ids);
  return events.filter((e) => idSet.has(e.id));
}

// One-way: there's no self-service unregister. If you can't make it,
// an admin removes you (removeEventRegistrant below) so the spot frees up
// for someone else without letting registration be a no-commitment toggle.
export async function registerForEvent(id) {
  await api.post(`/api/community/events/${id}/register`);
}

// Admin/staff only: who's registered for one event.
export async function fetchEventRegistrants(id) {
  const { data } = await api.get(`/api/community/events/${id}/registrants`);
  return data.map((r) => ({
    userId: r.user.user_id,
    name: r.user.full_name,
    email: r.user.email,
    userName: r.user.user_name,
    registeredAt: r.registration_date,
  }));
}

// Admin/staff only: removes a specific registrant (e.g. a no-show).
export async function removeEventRegistrant(eventId, userId) {
  await api.del(`/api/community/events/${eventId}/registrants/${userId}`);
}

// Admin/staff only: manually logs someone who registered off-site (e.g.
// through an externally-hosted event's own link) by email, so capacity/
// registrant tracking still works for events using registrationUrl.
export async function addEventRegistrant(eventId, email) {
  const { data } = await api.post(`/api/community/events/${eventId}/registrants`, { email });
  return data;
}

// Admin/staff only: sends every active registrant an in-app notification.
export async function sendEventReminder(id) {
  const { data } = await api.post(`/api/community/events/${id}/remind`);
  return data.sent;
}

// Derived purely from the clock. "ongoing" means we're between the event's
// start and its end (events without an endDate are treated as instantaneous).
export function getEventStatus(event, now = new Date()) {
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : start;
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "ongoing";
}

export function formatEventDate(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });
}

// Compact "Jul 12, 2026" form for card badges: full date without the noise
// of weekday/time/timezone.
export function formatEventDateShort(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
