// Client errors (4xx) keep their message: they're written for the user.
// Server errors (5xx) are logged in full but answered generically, so
// database/Supabase internals (table names, constraint text, SQL hints)
// never reach the browser.
export function errorHandler(err, req, res, next) {
  if (err?.name === "MulterError") {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)" : "Invalid upload" });
  }
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(status).json({ error: "Internal server error" });
  }
  res.status(status).json({ error: err.message || "Request failed" });
}
