// Admin/Staff always land in the admin panel, Lecturers in their own panel.
// Regardless of what page they clicked "Sign In" from, they're here to
// manage things, not to resume browsing. Everyone else returns to wherever
// they came from (`from`), or their profile if there's nowhere to return to.
export function destinationFor(role, from) {
  if (role === "Admin" || role === "Staff") return "/admin";
  if (role === "Lecturer") return "/lecturer";
  return isInternalPath(from) ? from : "/profile";
}

// Only same-site paths like "/community/42". Rejects "//evil.com",
// "/\\evil.com" and "https://..." so a crafted `from` can never turn the
// post-login redirect into an open redirect to another site.
function isInternalPath(path) {
  return typeof path === "string" && /^\/(?![\/\\])[^\s\\]*$/.test(path);
}
