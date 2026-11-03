import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import communityRoutes from "./modules/community/community.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import learningRoutes from "./modules/learning/learning.routes.js";
import membershipRoutes from "./modules/membership/membership.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import workspaceRoutes from "./modules/workspace/workspace.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import achievementsRoutes from "./modules/achievements/achievements.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { securityHeaders, apiLimiter } from "./middleware/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

export function createApp() {
  const app = express();

  // Behind a reverse proxy (Traefik/nginx) req.ip would otherwise be the
  // proxy's address and every visitor would share one rate-limit bucket.
  // TRUST_PROXY = number of proxy hops in front of this app (0 = none).
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
  app.disable("x-powered-by");
  app.use(securityHeaders());

  // CORS fails closed: with no CORS_ORIGIN in production, only same-origin
  // requests work (the SPA is served from this app, so it needs no CORS).
  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === "production";
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : !isProd, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", apiLimiter);

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/community", communityRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/learning", learningRoutes);
  app.use("/api/membership", membershipRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/workspace", workspaceRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/achievements", achievementsRoutes);
  app.use("/api/profile", profileRoutes);

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // Serve the built frontend (present in the Docker image; absent in local
  // `npm run dev`, where Vite serves it separately) and fall back to
  // index.html for client-side routes.
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
