import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { loginLimiter, authFlowLimiter } from "../../middleware/security.js";
import { login, resetPassword, forgotPasswordCheck, startVerifiedSignup, exchangeHandoff, logout } from "./auth.controller.js";
import { setSessionCookie, readSessionToken } from "../../shared/session.js";
import { microsoftLogin, microsoftCallback, microsoftCompleteSignup } from "./microsoft.controller.js";

const router = Router();

router.post("/signup/verify-start", authFlowLimiter, startVerifiedSignup);
router.post("/login", loginLimiter, login);
router.post("/forgot-password/check", authFlowLimiter, forgotPasswordCheck);
router.post("/reset-password", authFlowLimiter, resetPassword);

router.get("/microsoft/login", microsoftLogin);
router.get("/microsoft/callback", microsoftCallback);
router.post("/microsoft/complete-signup", authFlowLimiter, microsoftCompleteSignup);

// Confirms the bearer token is valid and returns the current user row.
router.post("/exchange", authFlowLimiter, exchangeHandoff);
router.post("/logout", logout);

router.get("/session", requireAuth, (req, res) => {
  // One-time migration: a browser still holding an old localStorage token
  // (sent as Bearer) gets the HttpOnly cookie, then drops the stored copy.
  if (req.authVia === "bearer") {
    const { token } = readSessionToken(req);
    setSessionCookie(res, token);
  }
  res.json({ user: req.user });
});

export default router;
