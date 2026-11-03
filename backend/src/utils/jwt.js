import crypto from "crypto";
import jwt from "jsonwebtoken";

const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;

// Short fingerprint of the current password hash. Embedded in session and
// reset tokens: when the password changes, every older token stops working
// (a used reset link can't be replayed, and a password reset logs out other
// devices). Not reversible to the hash itself.
export function passwordVersion(passwordHash) {
  return crypto.createHash("sha256").update(String(passwordHash || "")).digest("base64url").slice(0, 16);
}

export function signToken({ user_id, role, password_hash }) {
  return jwt.sign({ user_id, role, pwv: passwordVersion(password_hash) }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN || "7d",
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

// For tokens that aren't a normal session (OAuth `state`, password-reset
// links). Always carries a `purpose` so requireAuth can refuse to accept
// it as a bearer session token.
export function signPurposeToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn });
}
