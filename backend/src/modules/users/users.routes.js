import { Router } from "express";
import { loginLimiter } from "../../middleware/security.js";
import { imageUpload as upload } from "../../shared/imageUpload.js";
import { requireAuth, requireRole } from "../../middleware/requireAuth.js";
import { createUser, getMe, listUsers, setUserStatus, updateMe, uploadMyAvatar, changeMyPassword } from "./users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateMe);
router.patch("/me/password", requireAuth, loginLimiter, changeMyPassword);
router.post("/me/avatar", requireAuth, upload.single("avatar"), uploadMyAvatar);
router.get("/", requireAuth, requireRole("admin", "staff"), listUsers);
router.post("/", requireAuth, requireRole("admin", "staff"), createUser);
router.patch("/:id/status", requireAuth, requireRole("admin", "staff"), setUserStatus);

export default router;
