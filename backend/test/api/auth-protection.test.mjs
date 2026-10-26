// Phase 18 — login protection
import test, { after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { api, strict, call, STRICT, db, newUser, loginAdmin, waitForMessage, mailReset, mailState, sleep, uniq } from "../helpers/api.mjs";

after(() => db.end());

test("wrong password and unknown account give the same answer", async () => {
  const u = await newUser();
  const wrong = await api("/auth/login", { method: "POST", body: { email: u.email, password: "nope-nope-1" } });
  const unknown = await api("/auth/login", { method: "POST", body: { email: `ghost${uniq()}@example.test`, password: "nope-nope-1" } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.data, unknown.data);
});

test("5 wrong passwords lock the account for 15 minutes, owner is emailed, admin can unlock", async () => {
  const u = await newUser();
  await mailReset();
  for (let i = 0; i < 5; i++) {
    const r = await api("/auth/login", { method: "POST", body: { email: u.email, password: "wrong-pass-1" } });
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }
  // Even the CORRECT password is refused while locked.
  const locked = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
  assert.equal(locked.status, 429);
  assert.equal(locked.data.code, "ACCOUNT_LOCKED");
  assert.match(locked.data.error, /try again in \d+ minute/);
  const { rows } = await db.query("SELECT locked_until FROM users WHERE id=$1", [u.id]);
  const mins = (new Date(rows[0].locked_until) - Date.now()) / 60000;
  assert.ok(mins > 14 && mins <= 15, `lock length ${mins}`);
  // owner emailed
  const msg = await waitForMessage("to_user_id = $1 AND template = 'account_locked'", [u.id]);
  assert.ok(msg, "lock notice queued");
  const ev = await db.query("SELECT 1 FROM security_events WHERE user_id=$1 AND event_type='account_locked'", [u.id]);
  assert.equal(ev.rowCount, 1);

  const admin = await loginAdmin();
  const un = await api(`/security/users/${u.id}/unlock`, { method: "POST", token: admin });
  assert.equal(un.status, 200);
  const ok = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
  assert.equal(ok.status, 200);
});

test("a correct login resets the failure count", async () => {
  const u = await newUser();
  for (let i = 0; i < 4; i++) await api("/auth/login", { method: "POST", body: { email: u.email, password: "wrong-pass-1" } });
  assert.equal((await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).status, 200);
  for (let i = 0; i < 4; i++) await api("/auth/login", { method: "POST", body: { email: u.email, password: "wrong-pass-1" } });
  assert.equal((await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).status, 200, "4+4 failures with a success between must not lock");
});

test("phone-only member gets an SMS about the lock", async () => {
  const u = await newUser({ phoneOnly: true });
  await mailReset();
  for (let i = 0; i < 5; i++) await api("/auth/login", { method: "POST", body: { email: u.phone, password: "wrong-pass-1" } });
  const msg = await waitForMessage("to_user_id = $1 AND channel = 'sms'", [u.id]);
  assert.ok(msg, "sms queued");
  assert.match(msg.to_address, /^\+234803\d{7}$/);
  assert.ok(msg.body_text.length <= 160);
  for (let i = 0; i < 40; i++) { const s = await mailState(); if (s.sms.some((x) => x.to === msg.to_address.slice(1))) return; await sleep(200); }
  assert.fail("SMS never reached the provider");
});

test("password reset unlocks the account and ends every older session", async () => {
  const u = await newUser();
  const oldToken = u.token;
  assert.equal((await api("/auth/me", { token: oldToken })).status, 200);
  for (let i = 0; i < 5; i++) await api("/auth/login", { method: "POST", body: { email: u.email, password: "wrong-pass-1" } });
  await mailReset();
  await api("/auth/forgot-password", { method: "POST", body: { email: u.email } });
  const msg = await waitForMessage("to_address = $1 AND template = 'password_reset'", [u.email]);
  assert.ok(msg);
  const url = msg.body_text.match(/reset-password\?token=([0-9a-f]+)&uid=([0-9a-f-]+)/);
  assert.ok(url, "reset link in email");
  const r = await api("/auth/reset-password", { method: "POST", body: { uid: url[2], token: url[1], newPassword: "BrandNew#123" } });
  assert.equal(r.status, 200);
  const old = await api("/auth/me", { token: oldToken });
  assert.equal(old.status, 401);
  assert.equal(old.data.code, "SESSION_ENDED");
  const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: "BrandNew#123" } });
  assert.equal(login.status, 200, "unlocked and new password works");
});

test("Sign out of all devices and change password end older tokens", async () => {
  const u = await newUser();
  const second = (await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).data.token;
  assert.equal((await api("/auth/logout-all", { method: "POST", token: u.token })).status, 200);
  assert.equal((await api("/auth/me", { token: u.token })).status, 401);
  assert.equal((await api("/auth/me", { token: second })).status, 401);

  const fresh = (await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).data.token;
  const bad = await api("/auth/change-password", { method: "POST", token: fresh, body: { currentPassword: "wrong", newPassword: "Another#1234" } });
  assert.equal(bad.status, 400);
  const ch = await api("/auth/change-password", { method: "POST", token: fresh, body: { currentPassword: u.password, newPassword: "Another#1234" } });
  assert.equal(ch.status, 200);
  assert.equal((await api("/auth/me", { token: fresh })).status, 401, "old token ended");
  assert.equal((await api("/auth/me", { token: ch.data.token })).status, 200, "returned token works");
});

test("admin lock ends sessions and blocks sign-in", async () => {
  const u = await newUser();
  const admin = await loginAdmin();
  assert.equal((await api(`/security/users/${u.id}/lock`, { method: "POST", token: admin, body: { minutes: 30 } })).status, 200);
  assert.equal((await api("/auth/me", { token: u.token })).status, 401);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).status, 429);
});

test("older password hashes are upgraded from 10 to 12 rounds on login", async () => {
  const u = await newUser();
  await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [u.id, bcrypt.hashSync(u.password, 10)]);
  assert.equal(bcrypt.getRounds((await db.query("SELECT password_hash FROM users WHERE id=$1", [u.id])).rows[0].password_hash), 10);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } })).status, 200);
  assert.equal(bcrypt.getRounds((await db.query("SELECT password_hash FROM users WHERE id=$1", [u.id])).rows[0].password_hash), 12);
  const reg = (await db.query("SELECT password_hash FROM users WHERE id=$1", [(await newUser()).id])).rows[0].password_hash;
  assert.equal(bcrypt.getRounds(reg), 12, "new accounts use 12");
});

test("per-IP limits are hit, say how long to wait, and are separate per route", async () => {
  // Server B has the real budgets: forgot-password allows 5 per hour.
  const email = `rl${uniq()}@example.test`;
  let last;
  for (let i = 0; i < 5; i++) { last = await strict("/auth/forgot-password", { method: "POST", body: { email } }); assert.equal(last.status, 200, `call ${i + 1}`); }
  last = await strict("/auth/forgot-password", { method: "POST", body: { email } });
  assert.equal(last.status, 429);
  assert.equal(last.data.code, "RATE_LIMITED");
  assert.match(last.data.error, /try again in \d+ minute/i);
  // A different route has its own budget.
  const other = await strict("/auth/login", { method: "POST", body: { email, password: "x-x-x-x-1" } });
  assert.equal(other.status, 401);
  // Login: 20 per 15 minutes.
  let blockedAt = 0;
  for (let i = 1; i <= 25; i++) { const r = await strict("/auth/login", { method: "POST", body: { email: `l${uniq()}@example.test`, password: "x-x-x-x-1" } }); if (r.status === 429) { blockedAt = i; break; } }
  assert.ok(blockedAt > 15 && blockedAt <= 21, `login limited after ${blockedAt}`);
});

test("security headers are on every response; production only allows your own site", async () => {
  const res = await fetch(`${STRICT}/health`);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(res.headers.get("strict-transport-security") || "", /max-age=31536000/);
  const csp = res.headers.get("content-security-policy-report-only");
  assert.ok(csp, "CSP is in report-only mode first");
  for (const host of ["https://checkout.paystack.com", "https://player.vimeo.com", "https://www.youtube.com", "tile.openstreetmap.org", "/s3-pub"]) {
    if (host === "/s3-pub") assert.match(csp, /img-src[^;]*127\.0\.0\.1/, "R2 images allowed"); else assert.ok(csp.includes(host), host);
  }
  assert.ok(csp.includes("frame-ancestors 'none'"));
  const evil = await fetch(`${STRICT}/api/auth/referral-lookup?code=X`, { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  // the app's own address always works, with no configuration (it serves its own pages and scripts)
  const own = await fetch(`${STRICT}/api/auth/referral-lookup?code=X`, { headers: { Origin: STRICT } });
  assert.notEqual(own.status, 403);
  const mine = await fetch(`${STRICT}/api/auth/referral-lookup?code=X`, { headers: { Origin: "https://app.example.test" } });
  assert.notEqual(mine.status, 403);
  assert.equal(mine.headers.get("access-control-allow-origin"), "https://app.example.test");
});

test("acting as a department: money actions refused, everything logged, log is searchable", async () => {
  const admin = await loginAdmin();
  const acting = { "X-Acting-As": "Finance" };
  assert.equal((await api("/security/acting-as", { method: "POST", token: admin, body: { department: "Finance" } })).status, 200);
  const blocked = await api("/finance/payments/00000000-0000-4000-8000-000000000001/pay", { method: "POST", token: admin, headers: acting, body: {} });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "ACTING_AS_BLOCKED");
  // The same call without the header is not blocked by the guard (it fails later, e.g. 404/400).
  const normal = await api("/finance/payments/00000000-0000-4000-8000-000000000001/pay", { method: "POST", token: admin, body: {} });
  assert.notEqual(normal.data.code, "ACTING_AS_BLOCKED");
  // Reading while acting is fine.
  assert.equal((await api("/finance/prices", { token: admin, headers: acting })).status, 200);
  const log = await api("/security/log?type=acting_as_blocked&limit=5", { token: admin });
  assert.equal(log.status, 200);
  assert.ok(log.data.events.length >= 1);
  assert.equal(log.data.events[0].detail.department, "Finance");
  const search = await api("/security/log?q=login_failed_none_xyz", { token: admin });
  assert.equal(search.status, 200);
  const byUser = await api(`/security/log?type=login_success`, { token: admin });
  assert.ok(byUser.data.events.some((e) => e.ip), "ip recorded on logins");
  // Non-admins cannot read it.
  const u = await newUser();
  assert.equal((await api("/security/log", { token: u.token })).status, 403);
});

test("password change is refused while acting as a department", async () => {
  const admin = await loginAdmin();
  const r = await api("/auth/change-password", { method: "POST", token: admin, headers: { "X-Acting-As": "Finance" }, body: { currentPassword: "a", newPassword: "bbbbbbbbb" } });
  assert.equal(r.status, 403);
});
