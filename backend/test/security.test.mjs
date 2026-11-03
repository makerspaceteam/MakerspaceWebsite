// Security regression tests: runs the real Express app against an in-memory
// fake Supabase (no real DB is touched). Usage:
//   npm run test:security
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const BACKEND = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.env.JWT_SECRET = "test-secret-".padEnd(64, "x");
process.env.NODE_ENV = "production";
process.env.CORS_ORIGIN = "https://makerspace.idri.edu.kh";
process.env.TRUST_PROXY = "0";

// ---- tiny in-memory PostgREST-ish fake -------------------------------------
const db = {
  users: [
    { user_id: 1, role: "user", status: "active", email: "student@cadt.edu.kh", password_hash: "x" },
    { user_id: 2, role: "staff", status: "active", email: "staff@cadt.edu.kh", password_hash: "x" },
    { user_id: 3, role: "admin", status: "active", email: "admin@cadt.edu.kh", password_hash: "x" },
  ],
  inventory_items: [{ item_id: 10, item_name: "Resistor", unit_credit: 5, current_stock: 100, is_returnable: false }],
  memberships: [{ membership_id: 1, user_id: 1, credits: 50 }],
  community_posts: [{ post_id: 7, user_id: 1, title: "t", content: "c", created_at: "2026-01-01" }],
  credit_transactions: [], requests: [], invoices: [], invoice_items: [], notifications: [],
};
let lastWrite = null;
function builder(table) {
  const st = { table, filters: [], op: "select", payload: null };
  const rows = () => (db[table] ||= []).filter((r) => st.filters.every(([c, v]) => r[c] == v));
  const run = () => {
    if (st.op === "insert") {
      const arr = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p, i) => ({ id: Date.now() + i, ...p }));
      (db[table] ||= []).push(...arr); lastWrite = { table, op: "insert", payload: st.payload };
      return arr;
    }
    if (st.op === "update") {
      const rs = rows(); rs.forEach((r) => Object.assign(r, st.payload));
      lastWrite = { table, op: "update", payload: st.payload }; return rs;
    }
    if (st.op === "delete") {
      const rs = rows(); db[table] = db[table].filter((r) => !rs.includes(r));
      lastWrite = { table, op: "delete" }; return rs;
    }
    return rows();
  };
  const b = {
    select() { return b; }, order() { return b; }, range() { return b; }, limit() { return b; }, ilike() { return b; },
    in(c, vs) { st.filters.push([c, vs[0]]); return b; }, neq() { return b; },
    eq(c, v) { st.filters.push([c, v]); return b; },
    insert(p) { st.op = "insert"; st.payload = p; return b; },
    update(p) { st.op = "update"; st.payload = p; return b; },
    upsert(p) { st.op = "insert"; st.payload = p; return b; },
    delete() { st.op = "delete"; return b; },
    maybeSingle() { const d = run(); return Promise.resolve({ data: d[0] ?? null, error: null }); },
    single() { const d = run(); return Promise.resolve(d[0] ? { data: d[0], error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } }); },
    then(res, rej) { return Promise.resolve({ data: run(), error: null, count: 0 }).then(res, rej); },
  };
  return b;
}
const fake = { from: builder, rpc: async () => ({ error: null }), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://x/y.png" } }) }) } };

mock.module(path.join(BACKEND, "src/config/supabaseClient.js"), {
  namedExports: { supabaseAdmin: fake, supabasePublic: fake, isSupabaseConfigured: true, assertSupabaseConfigured: () => true },
});

const { createApp } = await import(path.join(BACKEND, "src/app.js"));
const { signToken } = await import(path.join(BACKEND, "src/utils/jwt.js"));
let server, base;
before(async () => { server = createApp().listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

// Real tokens embed a password-version fingerprint, so build them from the DB row.
const tok = (id, role) => signToken({ user_id: id, role, password_hash: db.users.find((u) => u.user_id === id).password_hash });
const call = (method, p, { token, body, headers = {} } = {}) =>
  fetch(base + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const student = tok(1, "user"), staff = tok(2, "staff"), admin = tok(3, "admin");

test("C1: negative qty self-purchase is rejected and credits unchanged", async () => {
  const r = await call("POST", "/api/inventory/purchase", { token: student, body: { cart: [{ itemId: 10, qty: -1000 }] } });
  assert.equal(r.status, 400);
  assert.equal(db.memberships[0].credits, 50);
  assert.equal(db.inventory_items[0].current_stock, 100);
});
test("C1: fractional / string qty rejected", async () => {
  for (const qty of [0.5, "3", 0, 1e9]) {
    const r = await call("POST", "/api/inventory/purchase", { token: student, body: { cart: [{ itemId: 10, qty }] } });
    assert.equal(r.status, 400, `qty=${qty}`);
  }
});
test("C1: negative quantity purchase request rejected", async () => {
  const r = await call("POST", "/api/inventory/requests", { token: student, body: { request_type: "purchase", item_id: 10, quantity: -50 } });
  assert.equal(r.status, 400);
});
test("C1: valid qty still works (charges 2 x 5 = 10)", async () => {
  const r = await call("POST", "/api/inventory/purchase", { token: student, body: { cart: [{ itemId: 10, qty: 2 }] } });
  assert.equal(r.status, 201);
  assert.equal(db.memberships[0].credits, 40);
});
test("C2: student cannot create/update/delete inventory items", async () => {
  for (const [m, p] of [["POST", "/api/inventory/items"], ["PUT", "/api/inventory/items/10"], ["DELETE", "/api/inventory/items/10"],
                        ["POST", "/api/inventory/categories"], ["DELETE", "/api/inventory/locations/1"], ["PUT", "/api/inventory/filaments/1"]]) {
    const r = await call(m, p, { token: student, body: { unit_credit: 0 } });
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  assert.equal(db.inventory_items[0].unit_credit, 5);
});
test("C2: staff can still update inventory", async () => {
  const r = await call("PUT", "/api/inventory/items/10", { token: staff, body: { unit_credit: 6 } });
  assert.equal(r.status, 200);
});
test("H3: post owner cannot set server-managed columns", async () => {
  const r = await call("PUT", "/api/community/posts/7", { token: student, body: { title: "new", created_at: "1999-01-01", post_id: 999, user_id: 3 } });
  assert.equal(r.status, 200);
  assert.deepEqual(lastWrite.payload, { title: "new" });
});
test("H6: staff cannot suspend an admin; admin can", async () => {
  let r = await call("PATCH", "/api/users/3/status", { token: staff, body: { status: "inactive" } });
  assert.equal(r.status, 403);
  r = await call("PATCH", "/api/users/2/status", { token: admin, body: { status: "active" } });
  assert.equal(r.status, 200);
});
test("M: security headers present, x-powered-by gone", async () => {
  const r = await call("GET", "/api/health");
  assert.ok(r.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
  assert.ok(r.headers.get("strict-transport-security"));
  assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(r.headers.get("x-powered-by"), null);
});
test("M: CORS rejects foreign origin", async () => {
  const r = await call("GET", "/api/health", { headers: { origin: "https://evil.example" } });
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
test("M: 500 errors do not leak internals", async () => {
  fake.from = () => { throw new Error('relation "secret_table" violates constraint users_pkey'); };
  const r = await call("GET", "/api/community/tags");
  fake.from = builder;
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "Internal server error" });
});
test("M: SVG / HTML upload rejected", async () => {
  const fd = new FormData();
  fd.append("avatar", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "x.svg");
  const r = await fetch(base + "/api/users/me/avatar", { method: "POST", headers: { authorization: `Bearer ${student}` }, body: fd });
  assert.equal(r.status, 400);
});
test("H4: login brute force is rate limited after 10 failures", async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await call("POST", "/api/auth/login", { body: { email: "student@cadt.edu.kh", password: "wrong" + i } });
  assert.equal(last.status, 429);
});

// ---- second pass ------------------------------------------------------------
test("N1: post create ignores server-managed columns", async () => {
  const r = await call("POST", "/api/community/posts", { token: student, body: { title: "hi", content: "c", post_id: 999, created_at: "1999-01-01", user_id: 3 } });
  assert.equal(r.status, 201);
  const row = db.community_posts.at(-1);
  assert.equal(row.user_id, 1);
  assert.notEqual(row.post_id, 999);
  assert.notEqual(row.created_at, "1999-01-01");
});
test("N2: student cannot edit own post into an Announcement", async () => {
  const r = await call("PUT", "/api/community/posts/7", { token: student, body: { category: "Announcement" } });
  assert.equal(r.status, 403);
});
test("N3: javascript: URL in profile image is dropped", async () => {
  const r = await call("PATCH", "/api/users/me", { token: student, body: { profile_img_url: "javascript:alert(document.cookie)" } });
  assert.equal(r.status, 200);
  assert.equal(db.users[0].profile_img_url, null);
});

// ---- privilege escalation: can a normal user become admin? -----------------
import jwt from "jsonwebtoken";
test("P1: profile edit cannot set role/status", async () => {
  const r = await call("PATCH", "/api/users/me", { token: student, body: { full_name: "S", role: "admin", status: "active" } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(lastWrite.payload).sort(), ["full_name"]);
  assert.equal(db.users[0].role, "user");
});
test("P2: staff creating a user cannot pick admin role", async () => {
  const r = await call("POST", "/api/users", { token: staff, body: { full_name: "X", email: "x@cadt.edu.kh", password: "longenough1", role: "admin" } });
  assert.equal(r.status, 201);
  assert.equal(lastWrite.payload.role, "user");
});
test("P3: student cannot call admin-only user creation at all", async () => {
  const r = await call("POST", "/api/users", { token: student, body: { full_name: "X", email: "y@cadt.edu.kh", password: "longenough1", role: "admin" } });
  assert.equal(r.status, 403);
});
test("P4: role claim in a validly signed JWT is ignored (role comes from DB)", async () => {
  const forged = signToken({ user_id: 1, role: "admin", password_hash: db.users[0].password_hash });
  const r = await call("GET", "/api/users", { token: forged });
  assert.equal(r.status, 403);
});
test("P5: alg=none and wrong-secret tokens rejected", async () => {
  const none = jwt.sign({ user_id: 3, role: "admin" }, null, { algorithm: "none" });
  const wrong = jwt.sign({ user_id: 3, role: "admin" }, "guessed-secret");
  for (const tk of [none, wrong]) {
    const r = await call("GET", "/api/users", { token: tk });
    assert.equal(r.status, 401);
  }
});
test("P6: purpose tokens (reset / signup) cannot be used as a session", async () => {
  const { signPurposeToken } = await import(path.join(BACKEND, "src/utils/jwt.js"));
  const reset = signPurposeToken({ user_id: 3, purpose: "pwd_reset" }, "15m");
  const r = await call("GET", "/api/users", { token: reset });
  assert.equal(r.status, 401);
});
test("P7: student cannot create lecturer accounts or change membership credits", async () => {
  for (const [m, p, b] of [["POST", "/api/learning/lecturers", { name: "L", email: "l@cadt.edu.kh", password: "longenough1" }],
                           ["POST", "/api/membership/1/topup", { amount: 1000 }],
                           ["POST", "/api/membership/bulk-topup", { amount: 1000 }],
                           ["PATCH", "/api/users/3/status", { status: "inactive" }]]) {
    const r = await call(m, p, { token: student, body: b });
    assert.equal(r.status, 403, `${m} ${p}`);
  }
});

// ---- L2 / L3 / L4: tokens out of URLs, HttpOnly cookie, no enumeration -----
import bcrypt from "bcrypt";
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

test("L4: forgot-password answers the same for real and unknown emails", async () => {
  const a = await call("POST", "/api/auth/forgot-password/check", { body: { email: "student@cadt.edu.kh" } });
  const b = await call("POST", "/api/auth/forgot-password/check", { body: { email: "nobody-here@cadt.edu.kh" } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(await a.json(), await b.json());
});
test("L3: login sets an HttpOnly cookie and returns no token in the body", async () => {
  db.users.push({ user_id: 9, role: "user", status: "active", email: "cookie@cadt.edu.kh", password_hash: await bcrypt.hash("correct-horse", 4) });
  const r = await call("POST", "/api/auth/login", { body: { email: "cookie@cadt.edu.kh", password: "correct-horse" } });
  assert.equal(r.status, 200);
  const sc = r.headers.get("set-cookie") || "";
  assert.match(sc, /mk_session=/); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i); assert.match(sc, /Secure/i);
  const body = await r.json();
  assert.equal(body.token, undefined);
  assert.equal(body.user.password_hash, undefined);
});
test("L3: cookie session works; cookie write without X-Requested-With is refused (CSRF)", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "cookie@cadt.edu.kh", password: "correct-horse" } });
  const cookie = cookieOf(login);
  let r = await call("GET", "/api/auth/session", { headers: { cookie } });
  assert.equal(r.status, 200);
  r = await call("PATCH", "/api/users/me", { headers: { cookie }, body: { bio: "csrf" } });
  assert.equal(r.status, 403);
  r = await call("PATCH", "/api/users/me", { headers: { cookie, "x-requested-with": "fetch" }, body: { bio: "ok" } });
  assert.equal(r.status, 200);
});
test("L2: handoff codes are single-use", async () => {
  const { issueHandoff } = await import(path.join(BACKEND, "src/shared/handoff.js"));
  const code = issueHandoff("session", { token: signToken({ user_id: 9, role: "user", password_hash: db.users.find((u) => u.user_id === 9).password_hash }) });
  let r = await call("POST", "/api/auth/exchange", { body: { code, kind: "session" } });
  assert.equal(r.status, 200); assert.match(cookieOf(r), /mk_session=/);
  r = await call("POST", "/api/auth/exchange", { body: { code, kind: "session" } });
  assert.equal(r.status, 401);
  r = await call("POST", "/api/auth/exchange", { body: { code: "guessed", kind: "pwd_reset" } });
  assert.equal(r.status, 401);
});
test("L2: reset link works once; old sessions die after the password changes", async () => {
  const { signPurposeToken, passwordVersion } = await import(path.join(BACKEND, "src/utils/jwt.js"));
  const u = db.users.find((x) => x.user_id === 9);
  const oldSession = signToken(u);
  const reset = signPurposeToken({ user_id: 9, purpose: "pwd_reset", pwv: passwordVersion(u.password_hash) }, "15m");
  let r = await call("POST", "/api/auth/reset-password", { body: { token: reset, newPassword: "brand-new-pass" } });
  assert.equal(r.status, 200);
  r = await call("POST", "/api/auth/reset-password", { body: { token: reset, newPassword: "attacker-pass1" } });
  assert.equal(r.status, 401);
  r = await call("GET", "/api/auth/session", { token: oldSession });
  assert.equal(r.status, 401);
});
