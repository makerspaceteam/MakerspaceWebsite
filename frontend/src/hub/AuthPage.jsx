import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layers, Mail, Lock, User, LogIn, UserPlus, IdCard } from "lucide-react";
import { useAuth } from "./AuthContext";
import msBbgLogo from "../assets/ms_bbg_logo.png";
import { HubNav } from "./HubNav";
import { AppFooter } from "../components/AppFooter";
import { BASE_URL, api } from "../lib/api/client";
import { D, GRADIENT, ErrorBox, TextField, PasswordField, MicrosoftButton, OrDivider } from "./authUi";
import { destinationFor } from "./authNav";
// Single shared page for both /login and /register. Which mode is active
// is derived from the route, and switching modes navigates between the two
// routes while sliding an overlay panel across (classic sign-in/sign-up
// panel pattern): register puts the info panel on the left and the form on
// the right; login is the mirror of that.

// const MODULES = [
//   { label: "Community", color: "var(--community-gold)" },
//   { label: "Learning",  color: "var(--color-oxblood)" },
//   { label: "Inventory", color: "var(--color-inv-accent)" },
// ];

const OAUTH_ERROR_MESSAGES = {
  invalid_state: "Your sign-in attempt expired. Please try again.",
  no_email: "Microsoft didn't share an email address for that account.",
  inactive: "This account is inactive.",
  domain_not_allowed: "That Microsoft account isn't eligible to sign up here.",
  email_mismatch: "Please verify with the Microsoft account that matches the email you typed.",
  already_registered: "An account with this email already exists. Try signing in instead.",
  missing_email: "Please enter an email before continuing with Microsoft.",
  student_id_taken: "An account with this Student ID already exists.",
};

function continueWithMicrosoft() {
  window.location.href = `${BASE_URL}/api/auth/microsoft/login?intent=login`;
}

// ── Login form ──────────────────────────────────────────────────────────────
function LoginForm({ form, setForm, error, loading, showPw, setShowPw, onSubmit, mobileToggle }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={onSubmit} className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold mb-1" style={{ color: D.text }}>Welcome back</h1>
      <p className="text-sm" style={{ color: D.muted }}>Sign in to your CADT Makerspace account.</p>
      <ErrorBox message={error} />

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Email</label>
        <TextField icon={Mail} type="email" value={form.email} onChange={set("email")} placeholder="example@student.cadt.edu.kh" autoComplete="email" />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold" style={{ color: D.muted }}>Password</label>
          <Link to="/forgot-password" className="text-xs font-semibold hover:underline" style={{ color: "var(--color-inv-accent)" }}>
            Forgot password?
          </Link>
        </div>
        <PasswordField value={form.password} onChange={set("password")} placeholder="••••••••" autoComplete="current-password" show={showPw} onToggleShow={() => setShowPw(v => !v)} />
      </div>

      <button type="submit" disabled={loading}
        className="mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-85 disabled:opacity-60"
        style={{ background: GRADIENT }}>
        {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogIn size={14} />}
        {loading ? "Signing in…" : "Sign In"}
      </button>

      <OrDivider />
      <MicrosoftButton onClick={continueWithMicrosoft} />

      {mobileToggle}
    </form>
  );
}

// ── Register form ────────────────────────────────────────────────────────────
// Plain email/password signup is still allowed here, but only with a CADT
// email address — the backend rejects anything else (see auth.controller.js
// isDomainAllowed), so a Gmail/etc. address can't self-register through
// either this form or the Microsoft button below.
function RegisterForm({ form, setForm, error, loading, showPw, setShowPw, onSubmit, mobileToggle }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={onSubmit} className="w-full my-auto flex flex-col gap-2.5">
      {/* <div className="flex gap-1.5 mb-1">
        {MODULES.map(m => (
          <span key={m.label} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}>
            {m.label}
          </span>
        ))}
      </div> */}
      <h1 className="text-2xl font-extrabold mb-1" style={{ color: D.text }}>Create account</h1>
      <p className="text-sm" style={{ color: D.muted }}>Join CADT Makerspace and access all three modules.</p>
      <ErrorBox message={error} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Full Name</label>
        <TextField icon={User} type="text" value={form.name} onChange={set("name")} placeholder="Your name" autoComplete="name" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Email</label>
        <TextField icon={Mail} type="email" value={form.email} onChange={set("email")} placeholder="example@student.cadt.edu.kh" autoComplete="email" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Student ID</label>
        <TextField icon={IdCard} type="text" value={form.studentId} onChange={set("studentId")} placeholder="Your CADT Student ID" autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Password</label>
        <PasswordField value={form.password} onChange={set("password")} placeholder="Min. 6 characters" autoComplete="new-password" show={showPw} onToggleShow={() => setShowPw(v => !v)} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: D.muted }}>Confirm Password</label>
        <PasswordField value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" autoComplete="new-password" show={showPw} onToggleShow={() => setShowPw(v => !v)} />
      </div>

      <button type="submit" disabled={loading}
        className="mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-85 disabled:opacity-60"
        style={{ background: GRADIENT }}>
        {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <UserPlus size={14} />}
        {loading ? "Redirecting to Microsoft…" : "Continue"}
      </button>
      <p className="-mt-1.5 text-center text-xs" style={{ color: D.faint }}>
        You'll confirm this email with Microsoft before your account is created.
      </p>

      <OrDivider />
      <MicrosoftButton onClick={continueWithMicrosoft} />

      {mobileToggle}
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname === "/register";
  // Where to send the user after signing in: wherever they were trying to
  // reach (e.g. /inventory) takes priority over the generic role destination.
  const from = location.state?.from;
  // Carried through unchanged so the destination page can resume whatever
  // the user was doing (e.g. reopen a create dialog) instead of just
  // dropping them back on the page with no memory of what they clicked.
  const reopen = location.state?.reopen;
  const destState = reopen ? { reopen } : undefined;

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm]     = useState({ name: "", email: "", studentId: "", password: "", confirm: "" });
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  useEffect(() => { setError(""); setLoading(false); }, [isRegister]);

  // Surfaces failures redirected back from the Microsoft OAuth callback
  // (e.g. /login?error=inactive) as the same ErrorBox a failed form submit uses.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("error");
    if (code) setError(OAUTH_ERROR_MESSAGES[code] || "Something went wrong signing in with Microsoft.");
  }, [location.search]);

  // Already signed in but landed on /login or /register anyway (e.g. via a
  // bookmark, or the "back" button after a previous sign-in), bounce away
  // instead of showing a stale auth form. Uses replace so it doesn't add
  // yet another entry for "back" to trip over.
  useEffect(() => {
    if (user) navigate(destinationFor(user.role, from), { replace: true, state: destState });
  }, [user, navigate, from, destState]);

  const switchTo = (mode) => navigate(mode === "register" ? "/register" : "/login");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!loginForm.email || !loginForm.password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const loggedInUser = await login(loginForm.email, loginForm.password);
      navigate(destinationFor(loggedInUser.role, from), { replace: true, state: destState });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // Doesn't create the account directly — the plain form can't prove the
  // typed email is real on its own, so this only hashes the password and
  // hands back a short-lived token, then sends the browser to Microsoft to
  // actually prove ownership of that exact email. The account only gets
  // created once they come back from a successful Microsoft login (see
  // MicrosoftCallbackPage, landed on via the same /auth/callback?token=...
  // redirect "Continue with Microsoft" already uses).
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (!regForm.name || !regForm.email || !regForm.studentId.trim() || !regForm.password) { setError("Please fill in all fields."); return; }
    if (regForm.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (regForm.password !== regForm.confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const { pendingId } = await api.post("/api/auth/signup/verify-start", {
        full_name: regForm.name, email: regForm.email, student_id: regForm.studentId.trim(), password: regForm.password,
      });
      const params = new URLSearchParams({ intent: "signup_verify", email: regForm.email, pending: pendingId });
      window.location.href = `${BASE_URL}/api/auth/microsoft/login?${params.toString()}`;
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: `linear-gradient(160deg, ${D.bg} 0%, ${D.bg2} 100%)` }}>
    <HubNav light />

      <div aria-hidden className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(color-mix(in oklch, var(--color-inv-accent) 5%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in oklch, var(--color-inv-accent) 5%, transparent) 1px,transparent 1px)`, backgroundSize: "40px 40px" }} />

      {/* <Link to="/" className="flex items-center gap-2.5 mb-8 relative z-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: GRADIENT }}>
          <Layers size={16} color="white" strokeWidth={2.2} />
        </div>
        <span className="font-bold text-lg" style={{ color: D.text }}>CADT <span style={{ color: "var(--color-inv-accent)" }}>Hub</span></span>
      </Link> */}

      {/* ── Desktop: sliding overlay panel ──────────────────────────── */}
      <div className="relative z-10 hidden md:block w-full max-w-[840px] rounded-3xl overflow-hidden "
        style={{ height: "min(700px, calc(100vh - 100px))", background: D.card, boxShadow: "0 24px 64px rgba(0,0,30,0.35)" }}>

        {/* Sign-in form: lives in the left half, slides right and fades out when registering */}
        <div className="absolute top-0 left-0 h-full w-1/2 flex items-center px-10 transition-all duration-700 ease-in-out"
          style={{
            transform: isRegister ? "translateX(100%)" : "translateX(0)",
            opacity: isRegister ? 0 : 1,
            zIndex: isRegister ? 1 : 5,
            pointerEvents: isRegister ? "none" : "auto",
          }}>
          <LoginForm form={loginForm} setForm={setLoginForm} error={!isRegister ? error : ""} loading={loading}
            showPw={showPw} setShowPw={setShowPw} onSubmit={handleLogin} />
        </div>

        {/* Sign-up form: lives in the left half too, revealed on the right when registering */}
        <div className="absolute top-0 left-0 h-full w-1/2 flex px-10 py-6 overflow-y-auto transition-all duration-700 ease-in-out"
          style={{
            transform: isRegister ? "translateX(100%)" : "translateX(0)",
            opacity: isRegister ? 1 : 0,
            zIndex: isRegister ? 5 : 1,
            pointerEvents: isRegister ? "auto" : "none",
          }}>
          <RegisterForm form={regForm} setForm={setRegForm} error={isRegister ? error : ""} loading={loading}
            showPw={showPw} setShowPw={setShowPw} onSubmit={handleRegister} />
        </div>

        {/* Sliding gradient overlay: occupies whichever half the active form ISN'T on */}
        <div className="absolute top-0 h-full w-1/2 overflow-hidden transition-all duration-700 ease-in-out"
          style={{ left: isRegister ? 0 : "50%", zIndex: 20 }}>
          <div className="relative h-full transition-all duration-700 ease-in-out" style={{ width: "200%", left: isRegister ? "0%" : "-100%" }}>
            <div className="absolute inset-0" style={{ background: GRADIENT }} />
            <div aria-hidden className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

            {/* Shown when the overlay sits on the LEFT (register mode): points back to sign in */}
            <div className="absolute top-0 left-0 h-full w-1/2 flex flex-col items-center justify-center text-center px-10 text-white">
              <img src={msBbgLogo} alt="CADT Makerspace" className="h-10 w-auto object-contain mb-6" />
              <h2 className="text-2xl font-extrabold mb-3">Welcome back!</h2>
              <p className="text-sm text-white/80 mb-8 leading-relaxed">Already part of CADT Makerspace? Sign in to pick up where you left off.</p>
              <button type="button" onClick={() => switchTo("login")}
                className="px-7 py-2.5 rounded-full font-bold text-sm border-2 border-white text-white transition-colors hover:bg-white hover:text-[var(--color-inv-accent-text)]">
                Sign In
              </button>
            </div>

            {/* Shown when the overlay sits on the RIGHT (login mode): points to sign up */}
            <div className="absolute top-0 right-0 h-full w-1/2 flex flex-col items-center justify-center text-center px-10 text-white">
              <img src={msBbgLogo} alt="CADT Makerspace" className="h-10 w-auto object-contain mb-6" />
              <h2 className="text-2xl font-extrabold mb-3">New here?</h2>
              <p className="text-sm text-white/80 mb-8 leading-relaxed">Create a free account and unlock Community, Learning, and Inventory.</p>
              <button type="button" onClick={() => switchTo("register")}
                className="px-7 py-2.5 rounded-full font-bold text-sm border-2 border-white text-white transition-colors hover:bg-white hover:text-[var(--color-inv-accent-text)]">
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile: full-screen takeover, no sliding (too tight a space for it) ── */}
      <div className="md:hidden fixed inset-0 z-40 flex flex-col overflow-y-auto" style={{ background: D.card }}>

        {/* Info banner: same branding as the desktop overlay, with its own toggle button */}
        <div className="shrink-0 px-8 pt-14 pb-8 text-center" style={{ background: GRADIENT }}>
          <img src={msBbgLogo} alt="CADT Makerspace" className="h-9 w-auto object-contain mx-auto mb-3" />
          <h2 className="text-xl font-extrabold text-white mb-1.5">
            {isRegister ? "New here?" : "Welcome back"}
          </h2>
          <p className="text-xs text-white/85 leading-relaxed mb-5 max-w-xs mx-auto">
            {isRegister ? "Join the CADT Makerspace community." : "Sign in to continue to CADT Makerspace."}
          </p>
          <button type="button" onClick={() => switchTo(isRegister ? "login" : "register")}
            className="px-6 py-2 rounded-full font-bold text-xs border-2 border-white text-white transition-colors hover:bg-white hover:text-[var(--color-inv-accent-text)]">
            {isRegister ? "Sign In instead" : "Create an account"}
          </button>
        </div>

        <div className="flex-1 px-8 py-8">
          {isRegister ? (
            <RegisterForm form={regForm} setForm={setRegForm} error={error} loading={loading}
              showPw={showPw} setShowPw={setShowPw} onSubmit={handleRegister} />
          ) : (
            <LoginForm form={loginForm} setForm={setLoginForm} error={error} loading={loading}
              showPw={showPw} setShowPw={setShowPw} onSubmit={handleLogin} />
          )}
        </div>
      </div>

      {/* <p className="relative z-10 mt-8 text-xs" style={{ color: D.muted, opacity: 0.7 }}>
        © {new Date().getFullYear()} CADT Makerspace · Demo only
      </p> */}
        {/* <AppFooter /> */}
    </div>
  );
}
