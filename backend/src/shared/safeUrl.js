// User/staff-supplied links are rendered as <a href> / <iframe src> in the
// SPA. Only plain http(s) URLs are kept, so a "javascript:alert(1)" or
// "data:text/html,..." link can never be stored and clicked by someone else.
export function safeHttpUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
