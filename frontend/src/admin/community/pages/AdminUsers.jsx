import { useState, useEffect, useRef } from "react";
import { Search, Coins, BadgeCheck, Loader2, ShieldOff, ShieldCheck, UserPlus, X, ChevronLeft, ChevronRight, Upload, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../../lib/api/client";
import { useAuth } from "../../../hub/AuthContext";

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-border";

const ROLE_BADGE = {
  admin: "bg-red-50 text-red-600",
  staff: "bg-violet-50 text-violet-600",
  user: "bg-muted text-muted-foreground",
};

function StatusPill({ isMember }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
      isMember ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground"
    }`}>
      {isMember ? <BadgeCheck className="h-3 w-3" /> : null}
      {isMember ? "Active member" : "Not a member"}
    </span>
  );
}

function AccountStatusPill({ status }) {
  const active = status === "active";
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
      active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
    }`}>
      {active ? "Active account" : "Suspended"}
    </span>
  );
}

// Browsable list for when the admin doesn't have a specific name/email to
// search for, e.g. auditing "who are all my staff" or scanning for
// recently-joined members. Clicking a row opens the same detail panel a
// search result would.
//
// Paginated client-side (load more, PAGE_SIZE at a time) rather than
// rendering every row at once. The full list is still one API call (small
// enough for a single makerspace's user count), this just keeps the DOM
// from growing unbounded as the list does.
const PAGE_SIZE = 10;

function UsersTable({ title, subtitle, users, onSelect, selectedId, showStudentId = true }) {
  const colCount = showStudentId ? 4 : 3;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = users.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{users.length}</span>
      </div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Status</th>
                {showStudentId && (
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Student ID</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 ? (
                <tr><td colSpan={colCount} className="px-5 py-8 text-center text-sm text-muted-foreground">No accounts here.</td></tr>
              ) : visible.map(u => (
                <tr key={u.user_id} onClick={() => onSelect(u)}
                  className={`cursor-pointer hover:bg-muted transition-colors ${selectedId === u.user_id ? "bg-muted" : ""}`}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground truncate">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? "bg-muted text-muted-foreground"}`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <AccountStatusPill status={u.status} />
                  </td>
                  {showStudentId && (
                    <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{u.student_id || "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// CSV format: "student_id,amount" per row, with or without a header row
// (a first cell like "student_id"/"id" is detected and skipped). Kept as a
// tiny hand-rolled parser rather than a library since the format is fixed
// and simple — two plain columns, no quoted commas to worry about.
function parseCreditsCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const looksLikeHeader = /^(student[_ ]?id|id)$/i.test(lines[0].split(",")[0].trim());
  return lines.slice(looksLikeHeader ? 1 : 0).map((line) => {
    const [student_id, amount] = line.split(",").map((s) => s.trim());
    return { student_id, amount: Number(amount) };
  }).filter((r) => r.student_id);
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "Admin";
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [selected, setSelected] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which tab of the selected-student panel is showing. Deliberately NOT
  // reset in selectUser() — an admin awarding bonus credits to several
  // students in a row shouldn't get bounced back to the Account tab every
  // time they pick the next one.
  const [panelTab, setPanelTab] = useState("account");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  // Confirm-before-submit step for the single top-up, to catch a fat-fingered
  // amount before it actually hits the account (see submitTopUp below).
  const [topUpConfirming, setTopUpConfirming] = useState(false);
  const [transactions, setTransactions] = useState([]);

  // Create-user modal: role picker only shown to admins; a staff-submitted
  // request is forced to "user" server-side regardless of what's sent, so
  // there's no client-only guard to bypass here.
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", email: "", password: "", role: "user" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // Bulk credits modal: admin-only (see membership.routes.js — the server
  // rejects staff regardless). Two steps in one modal: pick a file → preview
  // the parsed rows → submit → show per-row results. bulkResults being set
  // is what switches the modal from preview to results view.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Bumped on every selectUser() call so a slow response from an earlier
  // selection can recognize it's stale and not overwrite whatever the admin
  // has since clicked into. Without this, clicking user A then quickly
  // user B could show A's membership data under B's name if A's request
  // happened to resolve second.
  const selectionRef = useRef(0);

  useEffect(() => {
    api.get("/api/users")
      .then(({ data }) => setUsers(data))
      .catch(() => setUsersError("Couldn't load users. Please try refreshing."))
      .finally(() => setLoadingUsers(false));
  }, []);

  const results = query.trim()
    ? users.filter(u =>
        u.full_name?.toLowerCase().includes(query.toLowerCase()) ||
        u.email?.toLowerCase().includes(query.toLowerCase()) ||
        u.student_id?.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const selectUser = (u) => {
    const token = ++selectionRef.current;
    setSelected(u);
    setQuery("");
    setError("");
    setTopUpOpen(false);
    setTopUpAmount("");
    setTopUpConfirming(false);
    setLoadingMembership(true);
    setTransactions([]);
    api.get(`/api/membership/${u.user_id}`)
      .then(({ data }) => {
        if (selectionRef.current !== token) return;
        setMembership(data);
      })
      .catch(() => {
        if (selectionRef.current !== token) return;
        setError("Couldn't load membership for this user.");
      })
      .finally(() => {
        if (selectionRef.current !== token) return;
        setLoadingMembership(false);
      });
    refreshTransactions(u.user_id, token);
  };

  // Re-fetched after every top-up too, so the list reflects what was just
  // added without needing to re-select the student. `token` is the same
  // staleness guard selectUser uses, so a slow refresh after switching
  // students can't stomp on the newly-selected one's list.
  const refreshTransactions = (userId, token) => {
    api.get(`/api/membership/${userId}/transactions`)
      .then(({ data }) => {
        if (selectionRef.current !== token) return;
        setTransactions(data);
      })
      .catch(() => {}); // non-critical — the account panel still works without history
  };

  const activate = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/api/membership/${selected.user_id}/activate`, {});
      setMembership(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 1: just validates and moves to a confirm screen — doesn't touch the
  // API yet, so a fat-fingered amount is still easy to back out of.
  const submitTopUp = (e) => {
    e.preventDefault();
    const credits = Number(topUpAmount);
    if (!credits || credits <= 0) {
      setError("Enter a positive number of credits.");
      return;
    }
    setError("");
    setTopUpConfirming(true);
  };

  // Step 2: the actual API call, only reached after the confirm screen.
  const confirmTopUp = async () => {
    const credits = Number(topUpAmount);
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/api/membership/${selected.user_id}/topup`, { credits });
      setMembership(data);
      setTopUpOpen(false);
      setTopUpConfirming(false);
      setTopUpAmount("");
      refreshTransactions(selected.user_id, selectionRef.current);
    } catch (err) {
      setError(err.message);
      setTopUpConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleAccountStatus = async () => {
    if (!selected) return;
    const nextStatus = selected.status === "active" ? "inactive" : "active";
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch(`/api/users/${selected.user_id}/status`, { status: nextStatus });
      setSelected(data);
      setUsers((prev) => prev.map((u) => (u.user_id === data.user_id ? data : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!createForm.full_name.trim() || !createForm.email.trim() || !createForm.password) {
      setCreateError("Name, email, and password are required.");
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }
    setCreateBusy(true);
    try {
      const { data } = await api.post("/api/users", {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: isAdmin ? createForm.role : "user",
      });
      setUsers((prev) => [data, ...prev]);
      setCreateOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", role: "user" });
    } catch (err) {
      setCreateError(err.message || "Couldn't create that account.");
    } finally {
      setCreateBusy(false);
    }
  };

  const openBulk = () => {
    setBulkFileName("");
    setBulkRows([]);
    setBulkError("");
    setBulkResults(null);
    setBulkConfirming(false);
    setBulkOpen(true);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkError("");
    setBulkResults(null);
    setBulkConfirming(false);
    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCreditsCsv(String(reader.result || ""));
      if (rows.length === 0) {
        setBulkError("Couldn't find any rows in that file. Expected \"student_id,amount\" per line.");
        setBulkRows([]);
        return;
      }
      setBulkRows(rows);
    };
    reader.onerror = () => setBulkError("Couldn't read that file.");
    reader.readAsText(file);
  };

  // Step 1: validates and moves to a confirm screen showing the total
  // student count + total credits, so a bad CSV is easy to catch before it
  // actually touches anyone's balance.
  const requestBulkConfirm = () => {
    const validRows = bulkRows.filter((r) => r.student_id && Number.isFinite(r.amount) && r.amount > 0);
    if (validRows.length === 0) {
      setBulkError("No valid rows to submit — every row needs a student ID and a positive amount.");
      return;
    }
    setBulkError("");
    setBulkConfirming(true);
  };

  // Step 2: the actual API call, only reached after the confirm screen.
  const submitBulk = async () => {
    const validRows = bulkRows.filter((r) => r.student_id && Number.isFinite(r.amount) && r.amount > 0);
    setBulkBusy(true);
    setBulkError("");
    try {
      const { data } = await api.post("/api/membership/bulk-topup", { rows: validRows });
      setBulkResults(data);
      setBulkConfirming(false);
    } catch (err) {
      setBulkError(err.message || "Couldn't process that upload.");
      setBulkConfirming(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const teamUsers = users.filter(u => u.role !== "user");
  const regularUsers = users.filter(u => u.role === "user");

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search a student to view their account, manage membership/credits, or suspend access.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <button onClick={openBulk}
              className="inline-flex items-center gap-2 border border-border text-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-muted transition-colors">
              <Upload className="h-4 w-4" /> Award Bonus Credits (Bulk)
            </button>
          )}
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 bg-foreground text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-foreground/85 transition-colors">
            <UserPlus className="h-4 w-4" /> New User
          </button>
        </div>
      </div>

      {usersError && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-600 text-sm px-4 py-2.5">{usersError}</div>
      )}

      <div className="bg-white rounded-xl border border-border p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={loadingUsers ? "Loading users…" : "Search by name, email, or student ID…"}
            disabled={loadingUsers}
            className={`${inputCls} pl-9`}
          />

          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-border shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {results.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => selectUser(u)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? "bg-muted text-muted-foreground"}`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!selected ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Search for a student above to get started.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Header band: separates identity from the actions below it,
                same two-tone card pattern as the ChartCard/StatCard panels
                elsewhere in admin. */}
            <div className="flex items-start justify-between gap-4 bg-muted px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ROLE_BADGE[selected.role] ?? "bg-muted text-muted-foreground"}`}>
                  {selected.full_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{selected.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{selected.email}{selected.student_id ? ` · ${selected.student_id}` : ""}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[selected.role] ?? "bg-muted text-muted-foreground"}`}>
                      {selected.role}
                    </span>
                    <AccountStatusPill status={selected.status} />
                  </div>
                </div>
              </div>
              {loadingMembership ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              ) : membership && <StatusPill isMember={membership.isMember} />}
            </div>

            {/* Two tabs so this doesn't turn into one long scroll of
                unrelated actions: identity/access vs. membership/credits. */}
            <div className="flex border-b border-border px-5">
              {[{ id: "account", label: "Account" }, { id: "credits", label: "Membership & Credits" }].map((t) => (
                <button key={t.id} onClick={() => setPanelTab(t.id)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    panelTab === t.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {error && (
                <div className="rounded-lg bg-red-50 text-red-600 text-sm px-4 py-2.5 mb-4">{error}</div>
              )}

              {panelTab === "account" && (
              <div>
                <button
                  onClick={toggleAccountStatus}
                  disabled={busy}
                  className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                    selected.status === "active"
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {selected.status === "active" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {selected.status === "active" ? "Suspend account" : "Reactivate account"}
                </button>
              </div>
              )}

              {panelTab === "credits" && !loadingMembership && membership && (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="p-2 rounded-lg bg-emerald-50">
                      <Coins className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground leading-none">{membership.credits}</p>
                      <p className="text-xs text-muted-foreground">credits available</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {!membership.isMember && (
                      <button
                        onClick={activate}
                        disabled={busy}
                        className="inline-flex items-center gap-2 bg-foreground text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-foreground/85 transition-colors disabled:opacity-50"
                      >
                        <BadgeCheck className="h-4 w-4" /> Activate Membership
                      </button>
                    )}

                    {membership.isMember && !topUpOpen && (
                      <button
                        onClick={() => setTopUpOpen(true)}
                        className="inline-flex items-center gap-2 bg-foreground text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-foreground/85 transition-colors"
                      >
                        <Coins className="h-4 w-4" /> Award Bonus Credits
                      </button>
                    )}
                  </div>

                  {membership.isMember && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      For rewards, like event participation or completing a course. Credits a student pays for are handled in the Inventory module (front desk top-up), not here.
                    </p>
                  )}

                  {topUpOpen && !topUpConfirming && (
                    <form onSubmit={submitTopUp} className="flex items-center gap-2 mt-4">
                      <input
                        type="number" min="1" autoFocus value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="Bonus credits to award"
                        className={`${inputCls} max-w-[160px]`}
                      />
                      <button type="submit"
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                        Add
                      </button>
                      <button type="button" onClick={() => { setTopUpOpen(false); setTopUpAmount(""); }}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                        Cancel
                      </button>
                    </form>
                  )}

                  {/* Confirm step: a second explicit click before the credits
                      actually move, so a typo'd amount is easy to catch. */}
                  {topUpOpen && topUpConfirming && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-foreground">
                        Award <strong>{topUpAmount} bonus credits</strong> to <strong>{selected.full_name}</strong>?
                        They'll have <strong>{(membership?.credits ?? 0) + Number(topUpAmount)}</strong> total after this.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => setTopUpConfirming(false)} disabled={busy}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                          Back
                        </button>
                        <button type="button" onClick={confirmTopUp} disabled={busy}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
                          {busy ? "Awarding…" : "Confirm & Award"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recent credit activity: reads the same credit_transactions
                      ledger every credit change already writes to, across
                      every module (membership top-up, bulk upload, inventory
                      spend, ...) — this just surfaces it for this one student. */}
                  <div className="mt-6 pt-5 border-t border-border">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent credit activity</p>
                    {transactions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No credit activity yet.</p>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {transactions.map((t) => (
                          <li key={t.transaction_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-foreground truncate">{t.description || t.source_type}</p>
                              <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                            </div>
                            <span className={`shrink-0 font-semibold tabular-nums ${t.transaction_type === "earn" ? "text-emerald-600" : "text-red-500"}`}>
                              {t.transaction_type === "earn" ? "+" : "-"}{t.amount}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {!loadingUsers && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <UsersTable
            title="Team"
            subtitle="Admins & staff with admin panel access"
            users={teamUsers}
            onSelect={selectUser}
            selectedId={selected?.user_id}
            showStudentId={false}
          />
          <UsersTable
            title="Users"
            subtitle="Registered makerspace members"
            users={regularUsers}
            onSelect={selectUser}
            selectedId={selected?.user_id}
          />
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCreateOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitCreate}
            className="w-full max-w-sm rounded-xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Create account</h2>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 rounded-lg bg-red-50 text-red-600 text-sm px-4 py-2.5">{createError}</div>
            )}

            <div className="flex flex-col gap-3">
              <input
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Full name" className={inputCls} autoFocus
              />
              <input
                type="email" value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email" className={inputCls}
              />
              <input
                type="password" value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Temporary password (min. 8 characters)" className={inputCls}
              />
              {isAdmin && (
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputCls}
                >
                  <option value="user">User</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setCreateOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createBusy}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-foreground hover:bg-foreground/85 transition-colors disabled:opacity-50">
                {createBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBulkOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white p-5 max-h-[85vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Award bonus credits (bulk)</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  For rewards — e.g. crediting everyone who attended an event or completed a course. Upload a CSV: one "student_id,amount" row per student.
                  Credits a student pays for are handled in the Inventory module, not here.
                </p>
              </div>
              <button type="button" onClick={() => setBulkOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {bulkError && (
              <div className="mb-4 rounded-lg bg-red-50 text-red-600 text-sm px-4 py-2.5">{bulkError}</div>
            )}

            {bulkResults ? (
              /* ── Results view: shown after submit ── */
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {bulkResults.filter((r) => r.status === "success").length} succeeded,{" "}
                  {bulkResults.filter((r) => r.status === "error").length} failed.
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{r.name || r.student_id}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.status === "success" ? `+${bulkRows.find((x) => x.student_id === r.student_id)?.amount ?? ""} credits → ${r.credits} total` : r.message}
                          </p>
                        </div>
                        {r.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={() => setBulkOpen(false)}
                  className="mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium text-white bg-foreground hover:bg-foreground/85 transition-colors">
                  Done
                </button>
              </>
            ) : (
              /* ── Upload + preview view ── */
              <>
                {!bulkConfirming && (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-center cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{bulkFileName || "Choose a CSV file"}</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleBulkFile} />
                </label>
                )}

                {bulkRows.length > 0 && !bulkConfirming && (
                  <>
                    <p className="mt-4 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {bulkRows.length} row{bulkRows.length === 1 ? "" : "s"} found
                    </p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                        {bulkRows.map((r, i) => {
                          const match = users.find((u) => u.student_id === r.student_id);
                          const rowValid = Number.isFinite(r.amount) && r.amount > 0;
                          return (
                            <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{match ? match.full_name : r.student_id}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {r.student_id}{match ? "" : " — not found in the current list"}
                                </p>
                              </div>
                              <span className={`shrink-0 text-xs font-semibold ${rowValid ? "text-foreground" : "text-red-500"}`}>
                                {rowValid ? `+${r.amount} cr` : "invalid amount"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      "Not found" rows are only checked against the list already loaded on this page — the server re-checks every row for real when you submit.
                    </p>
                  </>
                )}

                {/* Confirm step: shows the actual total before anything is
                    sent, so a bad CSV (wrong column, extra zero) is easy to
                    catch instead of silently crediting the wrong amounts. */}
                {bulkConfirming && (() => {
                  const validRows = bulkRows.filter((r) => r.student_id && Number.isFinite(r.amount) && r.amount > 0);
                  const totalCredits = validRows.reduce((sum, r) => sum + r.amount, 0);
                  return (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-foreground">
                        You're about to award bonus credits to <strong>{validRows.length} student{validRows.length === 1 ? "" : "s"}</strong>,
                        totaling <strong>{totalCredits} credits</strong>.
                      </p>
                      {bulkRows.length !== validRows.length && (
                        <p className="mt-1 text-xs text-red-600">
                          {bulkRows.length - validRows.length} row{bulkRows.length - validRows.length === 1 ? "" : "s"} will be skipped (missing ID or invalid amount).
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">This can't be undone in bulk — you'd need to reverse each one individually.</p>
                    </div>
                  );
                })()}

                <div className="mt-5 flex gap-2">
                  {bulkConfirming ? (
                    <>
                      <button type="button" onClick={() => setBulkConfirming(false)} disabled={bulkBusy}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                        Back
                      </button>
                      <button type="button" onClick={submitBulk} disabled={bulkBusy}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-foreground hover:bg-foreground/85 transition-colors disabled:opacity-50">
                        {bulkBusy ? "Applying…" : "Confirm & Apply"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setBulkOpen(false)}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                        Cancel
                      </button>
                      <button type="button" onClick={requestBulkConfirm} disabled={bulkRows.length === 0}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-foreground hover:bg-foreground/85 transition-colors disabled:opacity-50">
                        {`Review ${bulkRows.length || 0} student${bulkRows.length === 1 ? "" : "s"}`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
