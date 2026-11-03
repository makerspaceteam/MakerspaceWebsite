import { api, authFetch, BASE_URL } from "./api/client";

// Self-service profile edit: name/phone/bio/avatar only (see
// backend/src/modules/users/users.controller.js's updateMe).
export async function updateMyProfile(payload) {
  const { data } = await api.patch("/api/users/me", payload);
  return data;
}

// Requires the current password server-side (see users.controller.js),
// not just a valid session, so a left-open browser can't be used to lock
// the real owner out.
export async function changeMyPassword({ current_password, new_password }) {
  const { data } = await api.patch("/api/users/me/password", { current_password, new_password });
  return data;
}

// Multipart upload, same pattern as events' uploadEventImage: the JSON
// client can't carry files, so this goes through fetch directly with the
// same bearer token.
export async function uploadMyAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await authFetch(`/api/users/me/avatar`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.data.url;
}
