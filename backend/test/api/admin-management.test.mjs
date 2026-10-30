// Admin accounts: not registrable, one main admin, only the main admin adds/removes admins.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newUser, loginAdmin, uniq } from "../helpers/api.mjs";

after(() => db.end());

async function loginAs(u) {
  const r = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
  assert.equal(r.status, 200);
  return r.data.token;
}

test("admin cannot be created from the Register page", async () => {
  const r = await api("/auth/register", {
    method: "POST",
    body: { name: "Sneaky", email: `sneaky${uniq()}@example.test`, password: "Passw0rd1", role_type: "admin", sex: "male", setupCode: "anything" },
  });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /can't be created from registration/);
});

test("the seeded admin is the one and only main admin, enforced by the database", async () => {
  const { rows } = await db.query("SELECT email FROM users WHERE is_main_admin");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, process.env.TEST_ADMIN_EMAIL);
  // a second main admin is impossible
  const main = await loginAdmin();
  const person = await newUser();
  await api(`/admin/positions/admins/${person.id}/promote`, { method: "POST", token: main });
  await assert.rejects(db.query("UPDATE users SET is_main_admin = TRUE WHERE id = $1", [person.id]), /users_single_main_admin/);
});

test("main admin promotes an account, the new admin cannot add or remove admins, main admin removes them", async () => {
  const main = await loginAdmin();
  const person = await newUser();
  const found = await api(`/admin/positions/admins/candidates?q=${encodeURIComponent(person.email.slice(0, 10))}`, { token: main });
  assert.equal(found.status, 200);
  assert.ok(found.data.users.some((u) => u.id === person.id));

  const oldToken = await loginAs(person);
  const promote = await api(`/admin/positions/admins/${person.id}/promote`, { method: "POST", token: main });
  assert.equal(promote.status, 200);

  // the old session ends; a fresh login carries the admin role
  assert.equal((await api("/auth/me", { token: oldToken })).status, 401);
  const adminToken = await loginAs(person);
  const me = await api("/auth/me", { token: adminToken });
  assert.equal(me.data.user.role_type, "admin");

  // has admin features...
  assert.equal((await api("/admin/positions/hods", { token: adminToken })).status, 200);
  const list = await api("/admin/positions/hods", { token: adminToken });
  assert.equal(list.data.canManageAdmins, false);
  // ...but cannot add or remove admins
  const other = await newUser();
  assert.equal((await api(`/admin/positions/admins/${other.id}/promote`, { method: "POST", token: adminToken })).status, 403);
  assert.equal((await api(`/admin/positions/admins/${person.id}/remove`, { method: "POST", token: adminToken })).status, 403);
  assert.equal((await api("/admin/positions/admins/candidates?q=zz", { token: adminToken })).status, 403);

  // main admin: cannot remove itself, cannot promote an admin again
  const mainRow = await db.query("SELECT id FROM users WHERE is_main_admin");
  assert.equal((await api(`/admin/positions/admins/${mainRow.rows[0].id}/remove`, { method: "POST", token: main })).status, 400);
  assert.equal((await api(`/admin/positions/admins/${person.id}/promote`, { method: "POST", token: main })).status, 400);

  // removal gives the old account back
  const removed = await api(`/admin/positions/admins/${person.id}/remove`, { method: "POST", token: main });
  assert.equal(removed.status, 200);
  assert.match(removed.data.outcome, /farmer|buyer|investor|corper/);
  assert.equal((await api("/admin/positions/hods", { token: adminToken })).status, 401, "old admin session ended");
  const back = await api("/auth/login", { method: "POST", body: { email: person.email, password: person.password } });
  assert.equal(back.status, 200);
  assert.notEqual(back.data.user.role_type, "admin");
});

test("an admin with no earlier account is locked out when removed, and a department head loses the post", async () => {
  const main = await loginAdmin();
  const person = await newUser();
  await api(`/admin/positions/admins/${person.id}/promote`, { method: "POST", token: main });
  await api(`/admin/positions/hods/${person.id}/promote`, { method: "POST", token: main, body: { department: "Maintenance" } });
  await db.query("UPDATE users SET previous_role_type = NULL WHERE id = $1", [person.id]);
  const removed = await api(`/admin/positions/admins/${person.id}/remove`, { method: "POST", token: main });
  assert.equal(removed.status, 200);
  assert.match(removed.data.outcome, /locked/);
  const { rows } = await db.query("SELECT department_head_of, locked_until FROM users WHERE id = $1", [person.id]);
  assert.equal(rows[0].department_head_of, null);
  assert.ok(new Date(rows[0].locked_until) > new Date());
});
