import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Browser-side hardening headers. The SPA is served by this same Express
// app, so the CSP only needs our own origin plus Google Fonts; images may
// come from Supabase Storage or any https URL a user/staff pasted.
export function securityHeaders() {
  const connectSrc = ["'self'"];
  if (process.env.VITE_BACKEND_URL) {
    try { connectSrc.push(new URL(process.env.VITE_BACKEND_URL).origin); } catch { /* ignore bad URL */ }
  }
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc,
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://login.microsoftonline.com"],
      },
    },
    crossOriginEmbedderPolicy: false, // remote images (Supabase, Unsplash) don't send CORP headers
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}

const json429 = (message) => (req, res) => res.status(429).json({ error: message });

// Whole API: generous ceiling that only trips on scripted abuse.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: json429("Too many requests. Please slow down."),
});

// Password guessing: 10 failed logins per IP+email per 15 minutes.
// Successful logins don't count, so a real user mistyping once is fine.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`,
  handler: json429("Too many failed sign-in attempts. Try again in 15 minutes."),
});

// Account lookup / signup / reset endpoints: stops email enumeration sweeps.
export const authFlowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: json429("Too many attempts. Try again in 15 minutes."),
});
