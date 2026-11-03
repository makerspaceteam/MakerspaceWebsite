import { api, authFetch, BASE_URL } from "./api/client";

// Mirrors backend/src/modules/achievements/achievements.controller.js's
// REQUIREMENT_TYPES: kept to a fixed set of real, countable actions rather
// than free text, so a badge's requirement always maps to something real.
export const REQUIREMENT_TYPE_LABELS = {
  event_registrations: "Events registered for",
  course_enrollments: "Courses enrolled in",
  borrows: "Items borrowed",
  workspace_bookings: "Workspace requests made",
  community_posts: "Community posts created",
  collaboration_posts: "Find Team posts created",
};

// Which of the 3 module colors a badge belongs to, derived from its
// requirement_type rather than a separate DB column. Event/workspace/
// community-post/collab-post achievements are all "Community" space.
export const MODULE_BY_REQUIREMENT = {
  event_registrations: "community",
  workspace_bookings: "community",
  community_posts: "community",
  collaboration_posts: "community",
  course_enrollments: "learning",
  borrows: "inventory",
};

export const MODULE_COLORS = {
  community: "var(--community-gold)",
  learning: "var(--color-oxblood)",
  inventory: "var(--color-inv-accent)",
};

export async function fetchAchievements() {
  const { data } = await api.get("/api/achievements");
  return data;
}

// Full catalog for the current user, each annotated with earned/earned_at/
// progress toward the requirement: see getMyAchievements in the backend.
export async function fetchMyAchievements() {
  const { data } = await api.get("/api/achievements/me");
  return data;
}

export async function createAchievement(payload) {
  const { data } = await api.post("/api/achievements", payload);
  return data;
}

export async function updateAchievement(id, payload) {
  const { data } = await api.patch(`/api/achievements/${id}`, payload);
  return data;
}

export async function deleteAchievement(id) {
  await api.del(`/api/achievements/${id}`);
}

// Multipart upload, same pattern as events' uploadEventImage: the JSON
// client can't carry files, so this goes through fetch directly with the
// same bearer token.
export async function uploadAchievementIcon(file) {
  const form = new FormData();
  form.append("icon", file);
  const res = await authFetch(`/api/achievements/upload-icon`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.data.url;
}
