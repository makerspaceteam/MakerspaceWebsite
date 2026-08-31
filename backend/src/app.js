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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
  app.use(express.json());

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
