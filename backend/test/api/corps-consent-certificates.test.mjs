// Phase 14: no refund anywhere for corps fees; consent to share details with NYSC AGROALLIED SAED is required;
// members registered before consent was required see a banner and their certificate waits until they tick it.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, pay, db, newFarmer, newBuyer, loginAdmin, paystack, waitForMessage, uniq } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

let setAside = [];
// A certificate needs EVERY approved corps course, and other suites leave theirs in this shared database,
// so this suite sets them aside while it runs and puts them back afterwards.
after(async () => {
  if (setAside.length) await db.query("UPDATE courses SET approved = TRUE WHERE id = ANY($1)", [setAside]);
  await db.end(); await pool.end();
});

const YEAR = 2031, BATCH = "A", STREAM = "I"; // a batch of their own, so no other suite is touched
let admin, course, lessonId, batchRow;
const A = (p, opts = {}) => api(`/rtc/admin${p}`, { token: admin, ...opts });
const M = (p, token, opts = {}) => api(`/corpers${p}`, { token, ...opts });
let n = 0;
async function makeCorper({ consent = true, paid = true } = {}) {
  const id = `${uniq()}${++n}`; const num = Math.floor(Math.random() * 900000) + 100000;
  const password = "Passw0rd!x";
  const body = { name: `Consent ${id}`, email: `cc${id}@example.test`, password, role_type: "corper", sex: "male", phone: `0803${Math.floor(1000000 + Math.random() * 8999999)}`,
    callUpNumber: `NYSC/${id}`, stateCode: `PL/31A/${num}`, serviceYear: YEAR, batch: BATCH, stream: STREAM, stateOfDeployment: "Plateau", ppa: "PPA", discipline: "Agriculture", consentTerms: true, consentData: true };
  const r = await api("/auth/register", { method: "POST", body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const m = { id: r.data.user.id, token: r.data.token, email: body.email };
  if (paid) await db.query(`INSERT INTO corper_payments (reference, user_id, amount, status, provider, confirmed_at) VALUES ($1,$2,5000,'paid','manual',now())`, [`CPAY-C-${m.id.slice(0, 8)}`, m.id]);
  // a member who registered BEFORE consent was required: the answer was never given
  if (!consent) await db.query("UPDATE corper_profiles SET consent_data = FALSE, consent_data_at = NULL WHERE user_id = $1", [m.id]);
  return m;
}
async function finishCourse(m) {
  assert.equal((await M(`/courses/${course.id}/lessons/${lessonId}/complete`, m.token, { method: "POST", body: {} })).status, 200);
  const quiz = await M(`/courses/${course.id}/quiz`, m.token);
  assert.equal(quiz.status, 200, JSON.stringify(quiz.data));
  const qs = quiz.data.questions ?? quiz.data.quiz?.questions;
  const body = { answers: qs.map((q) => ({ questionId: q.id, optionId: q.options.find((o) => o.text === "RIGHT").id })), clientToken: `t-${m.id}-${Date.now()}` };
  const r = await M(`/courses/${course.id}/quiz/attempts`, m.token, { method: "POST", body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
}
const certOf = async (m) => (await M("/certificate", m.token)).data;
const dbCert = async (m) => (await db.query("SELECT * FROM corper_certificates WHERE user_id = $1", [m.id])).rows[0];

test("setup: a corps course (one live lesson and a quiz) and a batch of its own", async () => {
  admin = await loginAdmin();
  setAside = (await db.query("UPDATE courses SET approved = FALSE WHERE audience = 'corps' AND approved = TRUE RETURNING id")).rows.map((r) => r.id);
  const c = await A("/courses", { method: "POST", body: { title: `Consent ${Date.now()}`, description: "t", audience: "corps" } });
  course = c.data.course;
  const l = await A(`/courses/${course.id}/lessons`, { method: "POST", body: { title: "Live", kind: "live", url: "https://example.com/l", scheduledAt: new Date(Date.now() - 3600e3).toISOString() } });
  assert.equal(l.status, 201, JSON.stringify(l.data)); lessonId = l.data.lesson.id;
  const q = await A(`/courses/${course.id}/questions`, { method: "POST", body: { prompt: "Q?", explanation: "E", options: [{ text: "RIGHT", isCorrect: true }, { text: "WRONG" }] } });
  assert.equal(q.status, 201);
  let ap = await A(`/courses/${course.id}/approve`, { method: "POST", body: {} });
  if (ap.status === 409) ap = await A(`/courses/${course.id}/approve`, { method: "POST", body: { confirmImpact: true } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
});

test("consent is required to register, cannot be withdrawn, and is given with one tick", async () => {
  const bad = await api("/auth/register", { method: "POST", body: { name: "No Consent", email: `nc${uniq()}@example.test`, password: "Passw0rd!x", role_type: "corper", sex: "male", phone: `0803${Math.floor(1000000 + Math.random() * 8999999)}`,
    callUpNumber: `NYSC/${uniq()}`, stateCode: `PL/31A/${Math.floor(Math.random() * 900000) + 100000}`, serviceYear: YEAR, batch: BATCH, stream: STREAM, stateOfDeployment: "Plateau", ppa: "PPA", discipline: "Agriculture", consentTerms: true, consentData: false } });
  assert.equal(bad.status, 400, "registration without consent is refused");

  const m = await makeCorper({ consent: false });
  assert.equal((await M("/me", m.token)).data.profile.consentData, false, "the banner shows for this member");
  const wd = await M("/me/profile/documents", m.token, { method: "PUT", body: { consentData: false } });
  assert.equal(wd.status, 400, "no withdrawal");
  assert.equal((await M("/consent", "", { method: "POST", body: { consentData: true } })).status, 401);
  const f = await newFarmer(); assert.equal((await M("/consent", f.token, { method: "POST", body: { consentData: true } })).status, 403);
  for (const body of [{}, { consentData: false }, { consentData: "yes" }]) {
    const r = await M("/consent", m.token, { method: "POST", body }); assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.data.code, "CONSENT_REQUIRED");
  }
  const ok = await M("/consent", m.token, { method: "POST", body: { consentData: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.profile.profile.consentData, true);
  const at = (await db.query("SELECT consent_data_at FROM corper_profiles WHERE user_id = $1", [m.id])).rows[0].consent_data_at;
  assert.ok(at, "the time is kept");
  assert.equal((await M("/consent", m.token, { method: "POST", body: { consentData: true } })).status, 200, "giving it twice is harmless");
  assert.equal((await db.query("SELECT consent_data_at FROM corper_profiles WHERE user_id = $1", [m.id])).rows[0].consent_data_at.getTime(), at.getTime(), "the first time is kept");
  assert.equal((await M("/me/profile/documents", m.token, { method: "PUT", body: { consentData: false } })).status, 400, "still no withdrawal");
});

let legacy, willing, late;
test("a finished member without consent has a certificate that waits; one with consent is just like before", async () => {
  legacy = await makeCorper({ consent: false });
  willing = await makeCorper({ consent: true });
  await finishCourse(legacy); await finishCourse(willing);
  assert.ok(await dbCert(legacy) && await dbCert(willing), "both certificates exist (hidden until the batch is complete)");
  const l = await certOf(legacy);
  assert.equal(l.status, "awaiting_consent"); assert.equal(l.needsConsent, true);
  const w = await certOf(willing);
  assert.equal(w.status, "awaiting_batch"); assert.equal(w.needsConsent, false);
});

test("closing the batch releases only members who consented, tells the others once, and shows it to the office", async () => {
  const batches = (await A("/corps/batches")).data.batches;
  batchRow = batches.find((b) => b.serviceYear === YEAR && b.batch === BATCH && b.stream === STREAM);
  assert.ok(batchRow, "the batch exists");
  assert.equal((await A(`/corps/batches/${batchRow.id}`, { method: "PUT", body: { dueDate: new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10) } })).status, 200);
  const done = await A(`/corps/batches/${batchRow.id}/complete`, { method: "POST", body: {} });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.released, 1, "only the member who consented is released");
  assert.ok(done.data.waitingForConsent >= 1 && done.data.consentReminders >= 1);
  assert.equal((await dbCert(willing)).visible, true); assert.equal((await dbCert(legacy)).visible, false);
  assert.equal((await certOf(willing)).status, "ready"); assert.equal((await certOf(legacy)).status, "awaiting_consent");
  assert.equal((await M("/certificate/download", legacy.token)).status, 404, "nothing to download while it waits");
  assert.ok(await waitForMessage("to_user_id = $1 AND template = 'corps_consent_needed'", [legacy.id]), "the member is told");
  // the office sees it
  const members = (await A(`/corps/members?year=${YEAR}&batch=${BATCH}&stream=${STREAM}&limit=200`)).data.members;
  assert.equal(members.find((x) => x.userId === legacy.id).certificateStatus, "waiting_for_consent");
  assert.equal(members.find((x) => x.userId === willing.id).certificateStatus, "released");
  const b2 = (await A("/corps/batches")).data.batches.find((b) => b.id === batchRow.id);
  assert.ok(b2.certificates.waitingForConsent >= 1);
});

test("one tick releases the held certificate at once (and the member is told it is ready); the batch is not nagged twice", async () => {
  const before = (await db.query("SELECT count(*)::int AS n FROM messages WHERE to_user_id = $1 AND template = 'corps_consent_needed' AND channel = 'email'", [legacy.id])).rows[0].n;
  const ok = await M("/consent", legacy.token, { method: "POST", body: { consentData: true } });
  assert.equal(ok.status, 200); assert.equal(ok.data.certificateReleased, true);
  assert.equal((await dbCert(legacy)).visible, true);
  assert.equal((await certOf(legacy)).status, "ready");
  const pdf = await M("/certificate/download", legacy.token); assert.equal(pdf.status, 200);
  assert.equal((await M("/consent", legacy.token, { method: "POST", body: { consentData: true } })).data.certificateReleased, false, "nothing more to release");
  assert.equal(before, 1, "told exactly once");
});

test("a member who finishes after the batch closed: released at once with consent, held without it until they tick", async () => {
  late = await makeCorper({ consent: false });
  await finishCourse(late);
  assert.equal((await dbCert(late)).visible, false, "held although the batch is closed");
  assert.equal((await certOf(late)).status, "awaiting_consent");
  const withConsent = await makeCorper({ consent: true });
  await finishCourse(withConsent);
  assert.equal((await dbCert(withConsent)).visible, true, "released at once");
  assert.equal((await M("/consent", late.token, { method: "POST", body: { consentData: true } })).data.certificateReleased, true);
  assert.equal((await certOf(late)).status, "ready");
});

test("un-marking and re-marking a batch keeps the rule and does not remind the same member again", async () => {
  const held = await makeCorper({ consent: false }); await finishCourse(held);
  assert.equal((await A(`/corps/batches/${batchRow.id}/uncomplete`, { method: "POST", body: { reason: "test" } })).status, 200);
  assert.equal((await certOf(willing)).status, "awaiting_batch");
  const again = await A(`/corps/batches/${batchRow.id}/complete`, { method: "POST", body: {} });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal((await dbCert(held)).visible, false, "still waiting for the tick");
  assert.equal((await dbCert(willing)).visible, true, "the consenting members are released again");
  const sent = (await db.query("SELECT count(*)::int AS n FROM messages WHERE to_user_id = $1 AND template = 'corps_consent_needed' AND channel = 'email'", [held.id])).rows[0].n;
  assert.equal(sent, 1, "reminded once, not once per closing");
});

test("a corps fee can never be refunded: not in the Refund room, not in search, not by id", async () => {
  assert.equal((await pay("/rtc/admin/corps/fee", { method: "PUT", token: admin, body: { amount: 5000 } })).status, 200);
  const m = await makeCorper({ consent: true, paid: false });
  const start = await pay("/corpers/payments/initiate", { method: "POST", token: m.token, body: { acceptNonRefundable: true } });
  assert.equal(start.status, 201, JSON.stringify(start.data));
  const ref = start.data.payment.reference;
  await paystack.success(ref, "amountKobo=100"); await paystack.webhook(ref);   // money arrives but is the wrong amount: refused
  const g = (await db.query("SELECT * FROM gateway_payments WHERE reference = $1", [ref])).rows[0];
  assert.equal(g.status, "refused"); assert.equal(g.refund_status, "due");

  const att = (await pay("/refunds/attention", { token: admin })).data.items.find((x) => x.reference === ref);
  assert.ok(att, "the office still hears about money that could not be applied");
  assert.equal(att.refundable, false); assert.match(att.noRefundNote, /not refundable/i);
  const found = (await pay(`/refunds/search?q=${ref}`, { token: admin })).data.items.find((x) => x.reference === ref);
  assert.equal(found.refundable, false); assert.match(found.noRefundNote, /not refundable/i);
  const r = await pay(`/refunds/${g.id}`, { method: "POST", token: admin, body: { reason: "member asked for the money back" } });
  assert.equal(r.status, 409); assert.equal(r.data.code, "NOT_REFUNDABLE");
  assert.equal((await db.query("SELECT refund_status FROM gateway_payments WHERE id = $1", [g.id])).rows[0].refund_status, "due", "nothing changed");
  // the old corps refund route is still gone
  const row = (await db.query("SELECT id FROM corper_payments WHERE reference = $1", [ref])).rows[0];
  assert.equal((await pay(`/rtc/admin/corps/payments/${row.id}/refund`, { method: "POST", token: admin, body: { reason: "please" } })).status, 404);
});
