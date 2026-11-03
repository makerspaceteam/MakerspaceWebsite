import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ImagePlus, Lock } from "lucide-react";
import { useAuth } from "./AuthContext";
import { TopNav } from "../components/TopNav";
import { updateMyProfile, uploadMyAvatar, changeMyPassword } from "../lib/user-profile-data";

const D = {
  bg:     "#eef5fc",
  bg2:    "#dceafa",
  card:   "#ffffff",
  border: "rgba(91,170,216,0.22)",
  muted:  "#5b7286",
  faint:  "#8aa0b2",
  text:   "#16324a",
};

const inputCls = "w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2";

function Avatar({ name, avatar, size = 76 }) {
  const initials = name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  if (avatar) {
    return <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-extrabold text-white shrink-0"
      style={{ width: size, height: size, background: "linear-gradient(135deg,var(--community-gold),var(--color-inv-accent))", fontSize: size * 0.34 }}>
      {initials}
    </div>
  );
}

export default function EditProfilePage() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", student_id: "", phone_number: "", bio: "", profile_img_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Change-password panel: separate from the profile form above (own
  // fields, own submit, own error) since it's a distinct action with its
  // own server check (current password must match).
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    setForm({
      full_name: user.name || "",
      student_id: user.studentId || "",
      phone_number: user.phone || "",
      bio: user.bio || "",
      profile_img_url: user.avatar || "",
    });
  }, [user, authLoading, navigate]);

  if (!user) return null;

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB."); return; }
    setUploading(true);
    setError("");
    try {
      const url = await uploadMyAvatar(file);
      setForm((prev) => ({ ...prev, profile_img_url: url }));
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // Student ID is set-once: editable only while the account has none yet
  // (older accounts), read-only after that — the server enforces the same.
  const studentIdLocked = Boolean(user.studentId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentIdLocked && !form.student_id.trim()) { setError("Please enter your Student ID."); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await updateMyProfile({
        full_name: form.full_name.trim(),
        ...(studentIdLocked ? {} : { student_id: form.student_id.trim() }),
        phone_number: form.phone_number.trim(),
        bio: form.bio.trim(),
        profile_img_url: form.profile_img_url || null,
      });
      updateUser({ name: updated.full_name, studentId: updated.student_id || "", avatar: updated.profile_img_url, phone: updated.phone_number, bio: updated.bio });
      navigate("/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (!pwForm.current || !pwForm.next) { setPwError("Fill in both password fields."); return; }
    if (pwForm.next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("New passwords don't match."); return; }
    setPwSaving(true);
    try {
      await changeMyPassword({ current_password: pwForm.current, new_password: pwForm.next });
      setPwSuccess(true);
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwError(err.message || "Couldn't change your password.");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${D.bg} 0%, ${D.bg2} 100%)` }}>
      <TopNav />

      <main className="relative z-10 mx-auto max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <button onClick={() => navigate("/profile")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold mb-6 hover:opacity-70 transition-opacity"
          style={{ color: D.muted }}>
          <ArrowLeft size={14} /> Back to profile
        </button>

        <div className="mx-auto max-w-xl">
        <div className="rounded-2xl p-8" style={{ background: D.card, border: `1px solid ${D.border}`, boxShadow: "0 2px 20px rgba(15,50,80,0.08)" }}>
          <h1 className="text-xl font-extrabold mb-6" style={{ color: D.text }}>Edit profile</h1>

          {error && (
            <div className="rounded-xl px-4 py-3 mb-5 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={form.full_name} avatar={form.profile_img_url} />
              <div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarSelect} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-60"
                  style={{ color: D.text, borderColor: D.border }}>
                  <ImagePlus size={14} /> {uploading ? "Uploading…" : "Change photo"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Full name</label>
              <input required className={inputCls} style={{ borderColor: D.border, color: D.text }}
                value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Student ID</label>
              <input required={!studentIdLocked} readOnly={studentIdLocked} className={`${inputCls} ${studentIdLocked ? "cursor-not-allowed" : ""}`}
                style={{ borderColor: D.border, color: studentIdLocked ? D.muted : D.text, background: studentIdLocked ? D.bg : undefined }}
                placeholder="Your CADT Student ID"
                value={form.student_id} onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))} />
              <p className="mt-1 text-xs" style={{ color: D.faint }}>
                {studentIdLocked ? "Contact an admin if your Student ID needs to be changed." : "Can only be set once, so double-check it."}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Phone number <span className="font-normal" style={{ color: D.faint }}>(optional)</span></label>
              <input className={inputCls} style={{ borderColor: D.border, color: D.text }}
                value={form.phone_number} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Bio <span className="font-normal" style={{ color: D.faint }}>(optional)</span></label>
              <textarea rows={3} className={inputCls} style={{ borderColor: D.border, color: D.text }}
                value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => navigate("/profile")}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                style={{ color: D.text, border: `1px solid ${D.border}`, background: D.card }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,var(--community-gold),var(--color-inv-accent))" }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Separate card: a distinct action from the profile fields above,
            with its own server-side check (current password must match). */}
        <div className="mt-5 rounded-2xl p-8" style={{ background: D.card, border: `1px solid ${D.border}`, boxShadow: "0 2px 20px rgba(15,50,80,0.08)" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold" style={{ color: D.text }}>Password</h2>
              {!pwOpen && <p className="mt-0.5 text-xs" style={{ color: D.muted }}>Change the password you use to sign in.</p>}
            </div>
            {!pwOpen && (
              <button type="button" onClick={() => { setPwOpen(true); setPwSuccess(false); setPwError(""); }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ color: D.text, borderColor: D.border }}>
                <Lock size={14} /> Change password
              </button>
            )}
          </div>

          {pwOpen && (
            pwSuccess ? (
              <div className="mt-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
                Password updated.
                <button type="button" onClick={() => setPwOpen(false)}
                  className="ml-2 font-semibold underline">Done</button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
                {pwError && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                    {pwError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Current password</label>
                  <input type="password" required autoComplete="current-password" className={inputCls} style={{ borderColor: D.border, color: D.text }}
                    value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>New password</label>
                  <input type="password" required autoComplete="new-password" placeholder="Min. 8 characters" className={inputCls} style={{ borderColor: D.border, color: D.text }}
                    value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: D.muted }}>Confirm new password</label>
                  <input type="password" required autoComplete="new-password" className={inputCls} style={{ borderColor: D.border, color: D.text }}
                    value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setPwOpen(false); setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                    style={{ color: D.text, border: `1px solid ${D.border}`, background: D.card }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pwSaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,var(--community-gold),var(--color-inv-accent))" }}>
                    {pwSaving ? "Saving…" : "Update password"}
                  </button>
                </div>
              </form>
            )
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
