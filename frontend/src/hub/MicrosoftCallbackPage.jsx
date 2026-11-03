import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api/client";
import { destinationFor } from "./authNav";
import { D } from "./authUi";

// Landing spot for the Microsoft "Continue with Microsoft" redirect
// (intent=login). The URL only carries a one-time code; swapping it via POST
// makes the backend set the HttpOnly session cookie, so no token ever sits in
// the address bar, browser history, or server access logs.
export default function MicrosoftCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loadSession } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (!code) {
      navigate(`/login${error ? `?error=${encodeURIComponent(error)}` : ""}`, { replace: true });
      return;
    }

    api.post("/api/auth/exchange", { code, kind: "session" })
      .then(() => loadSession())
      .then((user) => navigate(destinationFor(user.role), { replace: true }))
      .catch(() => navigate("/login?error=invalid_state", { replace: true }));
  }, [location.search, loadSession, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: `linear-gradient(160deg, ${D.bg} 0%, ${D.bg2} 100%)` }}>
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(15,50,80,0.15)", borderTopColor: "var(--color-inv-accent)" }} />
        <p className="text-sm font-medium" style={{ color: D.muted }}>Signing you in…</p>
      </div>
    </div>
  );
}
