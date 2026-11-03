import { Router } from "express";
import { imageUpload as upload } from "../../shared/imageUpload.js";
import { requireAuth, requireRole } from "../../middleware/requireAuth.js";
import {
  listAchievements, createAchievement, updateAchievement, deleteAchievement, uploadAchievementIcon,
  getMyAchievements,
} from "./achievements.controller.js";

const router = Router();

router.get("/", requireAuth, listAchievements);
router.get("/me", requireAuth, getMyAchievements);
router.post("/", requireAuth, requireRole("admin", "staff"), createAchievement);
router.patch("/:id", requireAuth, requireRole("admin", "staff"), updateAchievement);
router.delete("/:id", requireAuth, requireRole("admin", "staff"), deleteAchievement);
router.post("/upload-icon", requireAuth, requireRole("admin", "staff"), upload.single("icon"), uploadAchievementIcon);

export default router;
