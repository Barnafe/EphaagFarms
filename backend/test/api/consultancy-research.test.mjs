// Phase 7: Research (internal PDFs, staff only) and Consultancy (public booking -> approval with a price ->
// Paystack -> scheduling), for members and for guests with no account.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, pay, db, newFarmer, loginAdmin, paystack, waitForMessage, uniq, PAY } from "../helpers/api.mjs";
import { calculateFee } from "../../src/services/paystack.js";
import { pool } from "../../src/db/pool.js";

process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");
let admin, offering;
const future = (days = 5) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const researchForm = (title, buf, name, type) => {
  const f = new FormData(); f.append("title", title); f.append("summary", "Yield trial summary");
  if (buf) f.append("file", new Blob([buf], { type }), name);
  return f;
};
const apply = (extra = {}, token) => pay("/consultancy/requests", { method: "POST", token, body: {
  name: "Amina Yusuf", email: `guest${uniq()}@example.test`, message: "I want help planning a poultry house for 500 birds.", offeringId: offering.id, ...extra } });
const track = (t) => pay(`/consultancy/track/${t}`);
const approve = (id, body, token = admin) => pay(`/consultancy/admin/requests/${id}/approve`, { method: "POST", token, body });
const row = async (ref) => (await db.query("SELECT * FROM consultancy_requests WHERE reference=$1", [ref])).rows[0];
async function approved(amount = 20000, extra = {}) {
  const a = await apply(extra);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const r = await row(a.data.request.reference);
  const ap = await approve(r.id, { amount, paymentTerms: "Pay within 7 days of approval." });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  return { token: a.data.trackToken, id: r.id, ref: r.reference, email: r.applicant_email };
}
async function paid(c) {
  const s = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: {} });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  await paystack.success(s.data.reference);
  assert.equal((await paystack.webhook(s.data.reference)).appStatus, 200);
  return s.data;
}

test("setup", async () => {
  admin = await loginAdmin();
  const o = await pay("/rtc/admin/consultancy/offerings", { method: "POST", token: admin, body: { title: `Poultry planning ${uniq()}`, description: "Layout and feed plan" } });
  assert.equal(o.status, 201);
  offering = o.data.offering;
});

// ---------------- Research ----------------
test("research is internal: a PDF is required, only staff can add, list, download and delete it", async () => {
  const f = await newFarmer();
  assert.equal((await pay("/rtc/admin/research", { token: f.token })).status, 403, "a member cannot list research");
  assert.equal((await pay("/rtc/admin/research", { method: "POST", token: f.token, body: researchForm("x", PDF, "r.pdf", "application/pdf") })).status, 403);
  assert.equal((await pay("/rtc/research", { token: f.token })).status, 404, "there is no member research route");
  assert.equal((await pay("/rtc/research")).status, 401, "and nothing for the public either");

  const noFile = await pay("/rtc/admin/research", { method: "POST", token: admin, body: researchForm("No file", null) });
  assert.equal(noFile.status, 400); assert.match(noFile.data.error, /PDF/);
  const noTitle = await pay("/rtc/admin/research", { method: "POST", token: admin, body: researchForm("  ", PDF, "r.pdf", "application/pdf") });
  assert.equal(noTitle.status, 400);
  const png = await pay("/rtc/admin/research", { method: "POST", token: admin, body: researchForm("Fake", PNG, "r.pdf", "application/pdf") });
  assert.ok(png.status >= 400 && png.status < 500, `a picture pretending to be a PDF is refused (${png.status})`);

  const title = `Maize trial ${uniq()}`;
  const ok = await pay("/rtc/admin/research", { method: "POST", token: admin, body: researchForm(title, PDF, "Maize trial.pdf", "application/pdf") });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const item = ok.data.research;
  assert.deepEqual([item.title, item.hasFile, item.fileName], [title, true, "Maize trial.pdf"]);
  assert.ok(!("fileUrl" in item), "the stored file id is not exposed");
  const list = await pay("/rtc/admin/research", { token: admin });
  assert.ok(list.data.research.some((x) => x.id === item.id));

  const dl = await pay(`/rtc/admin/research/${item.id}/file`, { token: admin, raw: true });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("content-type"), /pdf/);
  assert.match(dl.headers.get("content-disposition"), /attachment/);
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), PDF.toString());
  assert.equal((await pay(`/rtc/admin/research/${item.id}/file`, { token: f.token })).status, 403, "a member cannot download it");
  assert.equal((await pay(`/rtc/admin/research/${item.id}/file`)).status, 401);
  const stored = (await db.query("SELECT file_url FROM research WHERE id=$1", [item.id])).rows[0].file_url;
  const viaFiles = await pay(`/files/${stored}`, { token: f.token });
  assert.ok([401, 403, 404].includes(viaFiles.status), `a member cannot reach it through the file route either (${viaFiles.status})`);

  assert.equal((await pay(`/rtc/admin/research/${item.id}`, { method: "DELETE", token: f.token })).status, 403);
  assert.equal((await pay(`/rtc/admin/research/${item.id}`, { method: "DELETE", token: admin })).status, 200);
  assert.equal((await pay(`/rtc/admin/research/${item.id}/file`, { token: admin })).status, 404);
});

// ---------------- Consultancy: applying ----------------
test("anyone can see the services and apply with no account; nothing is charged at application", async () => {
  const list = await pay("/consultancy/offerings");
  assert.equal(list.status, 200);
  assert.ok(list.data.offerings.some((o) => o.id === offering.id));
  const a = await apply({ phone: "08031234567" });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.match(a.data.request.reference, /^CNS-/);
  assert.match(a.data.trackToken, /^[0-9a-f]{48}$/);
  const r = await row(a.data.request.reference);
  assert.equal(r.status, "pending"); assert.equal(r.user_id, null); assert.equal(r.amount, null);
  assert.equal(r.applicant_phone, "+2348031234567", "stored in international form");
  const n = (await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE type='consultancy' AND subject_id=$1", [r.id])).rows[0].n;
  assert.equal(n, 0, "no payment exists yet");
  const m = await waitForMessage("template = 'consultancy_received' AND to_address = $1", [r.applicant_email]);
  assert.ok(m, "the applicant is emailed a private tracking link");
  assert.ok(m.body_html.includes(`/consultancy/request/${a.data.trackToken}`));
  assert.ok(await waitForMessage("template = 'consultancy_admin_new' AND body_html LIKE $1", [`%${r.reference}%`]), "admins are told");
});

test("a signed-in member applies too and the request is linked to them", async () => {
  const f = await newFarmer();
  const a = await pay("/consultancy/requests", { method: "POST", token: f.token, body: { message: "Please advise on irrigation for two hectares.", topic: "Irrigation advice" } });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const r = await row(a.data.request.reference);
  assert.equal(r.user_id, f.id); assert.ok(r.applicant_name);
  const mine = await pay("/consultancy/requests/me", { token: f.token });
  assert.equal(mine.data.requests.length, 1);
  assert.equal((await pay("/consultancy/requests/me")).status, 401);
});

test("applications are checked: contact details, message, a service or topic, and repeats are caught", async () => {
  const bad = [
    [{ name: "A" }, /name/i], [{ email: "", phone: "" }, /email address or a phone/i], [{ email: "not-an-email" }, /email/i],
    [{ phone: "123" }, /phone/i], [{ message: "short" }, /sentence/i], [{ offeringId: "00000000-0000-4000-8000-000000000000" }, /not found/i],
    [{ offeringId: undefined }, /service or say what/i],
  ];
  for (const [extra, re] of bad) {
    const r = await apply(extra);
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(extra)} -> ${r.status}`);
    assert.match(r.data.error, re);
  }
  const email = `rep${uniq()}@example.test`;
  assert.equal((await apply({ email })).status, 201);
  const again = await apply({ email });
  assert.equal(again.status, 409); assert.match(again.data.error, /already have an open request/i);
});

test("the private link shows the request; a wrong link finds nothing", async () => {
  const a = await apply();
  const t = await track(a.data.trackToken);
  assert.equal(t.status, 200);
  assert.equal(t.data.request.status, "pending");
  assert.ok(!("applicantEmail" in t.data.request), "contact details of others are not exposed");
  assert.equal((await track("0".repeat(48))).status, 404);
  assert.equal((await track("short")).status, 404);
});

// ---------------- Consultancy: approval and payment ----------------
test("only admins decide; approval needs a fee and payment terms; the applicant is sent the amount and terms", async () => {
  const f = await newFarmer();
  const a = await apply(); const r = await row(a.data.request.reference);
  assert.equal((await approve(r.id, { amount: 20000, paymentTerms: "x" }, f.token)).status, 403);
  assert.equal((await pay(`/consultancy/admin/requests/${r.id}/approve`, { method: "POST", body: {} })).status, 401);
  for (const body of [{}, { amount: -5, paymentTerms: "t" }, { amount: 50, paymentTerms: "t" }, { amount: 20000 }, { amount: "abc", paymentTerms: "t" }]) {
    const x = await approve(r.id, body);
    assert.equal(x.status, 400, JSON.stringify(body));
  }
  const ok = await approve(r.id, { amount: 20000, paymentTerms: "Pay within 7 days of approval." });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.request.status, "awaiting_payment"); assert.equal(ok.data.request.amount, 20000);
  const q = calculateFee(20000);
  const m = await waitForMessage("template = 'consultancy_approved' AND to_address = $1", [r.applicant_email]);
  assert.ok(m, "the approval email is sent");
  assert.ok(m.body_html.includes("Pay within 7 days of approval."));
  assert.ok(m.body_html.includes("20,000"), "it shows the consultancy fee");
  assert.ok(!m.body_html.includes("Paystack"), "the email does not name the gateway (owner's correction rule)");
  const t = await track(a.data.trackToken);
  assert.equal(t.data.request.quote.totalToPay, q.gross);
  assert.equal((await approve(r.id, { amount: 5000, paymentTerms: "again" })).status, 409, "it cannot be approved twice");
});

test("paying: the amount comes from the server, a repeat click reuses the same payment, and a verified payment makes it ready to schedule", async () => {
  const c = await approved(20000);
  const s1 = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: { amount: 1 } }); // browser-sent amount is ignored
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
  const q = calculateFee(20000);
  assert.equal(s1.data.amount, 20000); assert.equal(s1.data.total, q.gross); assert.ok(s1.data.authorizationUrl);
  const s2 = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: {} });
  assert.equal(s2.data.reference, s1.data.reference, "the same waiting payment is reused");
  assert.equal(s2.data.reused, true);
  const gp0 = (await db.query("SELECT user_id, meta FROM gateway_payments WHERE reference=$1", [s1.data.reference])).rows[0];
  assert.equal(gp0.user_id, null); assert.equal(gp0.meta.contactEmail, c.email);

  assert.equal((await track(c.token)).data.request.status, "awaiting_payment");
  await paystack.success(s1.data.reference);
  assert.equal((await paystack.webhook(s1.data.reference)).appStatus, 200);
  assert.equal((await paystack.webhook(s1.data.reference)).appStatus, 200); // a repeat webhook changes nothing
  const r = await row(c.ref);
  assert.equal(r.status, "ready"); assert.ok(r.paid_at);
  const inc = (await db.query("SELECT amount FROM finance_income WHERE description LIKE $1", [`%${c.ref}%`])).rows;
  assert.equal(inc.length, 1); assert.equal(Number(inc[0].amount), 20000, "income is the fee only, not Paystack's processing fee");
  assert.ok(await waitForMessage("template = 'consultancy_receipt' AND to_address = $1", [c.email]), "receipt");
  assert.ok(await waitForMessage("template = 'payment_finance_notice' AND body_html LIKE $1", ["%Consultancy%"]), "Finance is told");
  assert.ok(await waitForMessage("template = 'consultancy_admin_ready' AND body_html LIKE $1", [`%${c.ref}%`]), "admins are told it is ready to schedule");
  const again = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: {} });
  assert.equal(again.status, 409); assert.match(again.data.error, /already been paid/i);
});

test("the return page check settles a payment even without the webhook", async () => {
  const c = await approved(15000);
  const s = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: {} });
  await paystack.success(s.data.reference);
  const t = await track(c.token);
  assert.equal(t.data.request.status, "ready");
});

test("a payment that does not match, or for a request that was cancelled, is refused and sent to the Refund room", async () => {
  const c = await approved(12000);
  const s = await pay(`/consultancy/track/${c.token}/pay`, { method: "POST", body: {} });
  await paystack.set(s.data.reference, `status=success&amountKobo=100`);
  await paystack.webhook(s.data.reference);
  let gp = (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [s.data.reference])).rows[0];
  assert.equal(gp.status, "refused"); assert.equal(gp.refusal_reason, "amount_mismatch");
  assert.equal((await row(c.ref)).status, "awaiting_payment", "the request is untouched");
  assert.ok(await waitForMessage("template = 'payment_refused' AND to_address = $1", [c.email]), "a guest payer is told too");
  const att = await pay("/refunds/attention", { token: admin });
  const hit = (att.data.items || att.data.attention || att.data.payments || []).find((x) => x.reference === s.data.reference);
  assert.ok(hit, "it appears under Needs attention");
  assert.ok(hit.payer_name || hit.payerName, "with the guest's name");

  const c2 = await approved(12000);
  const s2 = await pay(`/consultancy/track/${c2.token}/pay`, { method: "POST", body: {} });
  assert.equal((await pay(`/consultancy/admin/requests/${c2.id}/cancel`, { method: "POST", token: admin, body: { reason: "Duplicate" } })).status, 200);
  await paystack.success(s2.data.reference); await paystack.webhook(s2.data.reference);
  gp = (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [s2.data.reference])).rows[0];
  assert.equal(gp.status, "refused"); assert.equal(gp.refusal_reason, "payment_closed");
  assert.equal((await row(c2.ref)).status, "cancelled");
});

test("a free consultancy needs no payment and goes straight to scheduling; a rejection needs a reason and closes it", async () => {
  const a = await apply(); const r = await row(a.data.request.reference);
  const ok = await approve(r.id, { amount: 0 });
  assert.equal(ok.data.request.status, "ready");
  assert.ok(await waitForMessage("template = 'consultancy_approved_free' AND to_address = $1", [r.applicant_email]));
  assert.equal((await pay(`/consultancy/track/${a.data.trackToken}/pay`, { method: "POST", body: {} })).status, 409);

  const b = await apply(); const rb = await row(b.data.request.reference);
  const rej = (body) => pay(`/consultancy/admin/requests/${rb.id}/reject`, { method: "POST", token: admin, body });
  assert.equal((await rej({})).status, 400);
  const done = await rej({ reason: "Outside what we advise on right now." });
  assert.equal(done.data.request.status, "rejected");
  const m = await waitForMessage("template = 'consultancy_rejected' AND to_address = $1", [rb.applicant_email]);
  assert.ok(m.body_html.includes("Outside what we advise on right now."));
  assert.equal((await track(b.data.trackToken)).data.request.decisionReason, "Outside what we advise on right now.");
  assert.equal((await pay(`/consultancy/track/${b.data.trackToken}/pay`, { method: "POST", body: {} })).status, 409);
  assert.equal((await rej({ reason: "again" })).status, 409, "a closed request cannot be changed again");
});

test("a phone-only applicant is asked for an email once at payment, and gets SMS notices", async () => {
  const phone = `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  const a = await apply({ email: "", phone });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const r = await row(a.data.request.reference);
  assert.equal(r.applicant_email, null);
  assert.ok(await waitForMessage("channel='sms' AND template = 'consultancy_received' AND to_address = $1", [r.applicant_phone]), "SMS received notice");
  const ap = await approve(r.id, { amount: 8000, paymentTerms: "Pay within 3 days" });
  assert.equal(ap.status, 200);
  assert.ok(await waitForMessage("channel='sms' AND template = 'consultancy_approved' AND to_address = $1", [r.applicant_phone]), "SMS with the amount");
  const withEmail = await pay(`/consultancy/track/${a.data.trackToken}/pay`, { method: "POST", body: { email: "not-valid" } });
  assert.equal(withEmail.status, 400);
  const ok = await pay(`/consultancy/track/${a.data.trackToken}/pay`, { method: "POST", body: { email: `later${uniq()}@example.test` } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

// ---------------- Consultancy: scheduling ----------------
test("scheduling: only after payment, with a real date, time and place or link; the applicant gets the details and the consultant's note", async () => {
  const c = await approved(20000);
  const sched = (body, token = admin) => pay(`/consultancy/admin/requests/${c.id}/schedule`, { method: "POST", token, body });
  assert.equal((await sched({ date: future(), time: "10:00", place: "Zoom" })).status, 409, "not paid yet");
  await paid(c);
  const f = await newFarmer();
  assert.equal((await sched({ date: future(), time: "10:00", place: "EPHAAG office" }, f.token)).status, 403);
  for (const body of [{ date: "2020-01-01", time: "10:00", place: "Zoom" }, { date: "nope", time: "10:00", place: "Zoom" },
    { date: future(), time: "25:99", place: "Zoom" }, { date: future(), time: "10:00", place: "" }]) {
    assert.equal((await sched(body)).status, 400, JSON.stringify(body));
  }
  const d = future(6);
  const ok = await sched({ date: d, time: "10:30", place: "https://meet.example.test/abc", note: "Bring your farm records." });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.request.status, "scheduled");
  const m = await waitForMessage("template = 'consultancy_scheduled' AND to_address = $1", [c.email]);
  assert.ok(m.body_html.includes(d) && m.body_html.includes("10:30") && m.body_html.includes("https://meet.example.test/abc") && m.body_html.includes("Bring your farm records."));
  const t = await track(c.token);
  assert.deepEqual(t.data.request.session, { date: d, time: "10:30", place: "https://meet.example.test/abc", note: "Bring your farm records." });

  const re = await sched({ date: future(8), time: "14:00", place: "EPHAAG office, Yelwa" });
  assert.equal(re.status, 200, "it can be rescheduled");
  assert.equal((await pay(`/consultancy/admin/requests/${c.id}/cancel`, { method: "POST", token: admin, body: {} })).status, 409, "a paid session is not cancelled here (use the Refund room)");
  const done = await pay(`/consultancy/admin/requests/${c.id}/complete`, { method: "POST", token: admin, body: {} });
  assert.equal(done.data.request.status, "completed");
  assert.equal((await sched({ date: future(9), time: "09:00", place: "Zoom" })).status, 409, "a completed session cannot be rescheduled");
});

test("refunding a paid consultancy in the Refund room cancels the session", async () => {
  const c = await approved(9000); const p = await paid(c);
  const gp = (await db.query("SELECT id FROM gateway_payments WHERE reference=$1", [p.reference])).rows[0];
  const r = await pay(`/refunds/${gp.id}`, { method: "POST", token: admin, body: { reason: "Consultant unavailable" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await row(c.ref)).status, "cancelled");
  assert.ok(await waitForMessage("template = 'refund_sent' AND to_address = $1", [c.email]), "the guest is told the money is returning");
});

test("the admin list shows applicants, status counts, and filters by status", async () => {
  const all = await pay("/consultancy/admin/requests", { token: admin });
  assert.equal(all.status, 200);
  assert.ok(all.data.requests.length > 3);
  assert.ok(all.data.requests.every((r) => "applicantName" in r && "isMember" in r));
  assert.ok(all.data.counts.pending >= 1);
  const only = await pay("/consultancy/admin/requests?status=completed", { token: admin });
  assert.ok(only.data.requests.every((r) => r.status === "completed"));
  const f = await newFarmer();
  assert.equal((await pay("/consultancy/admin/requests", { token: f.token })).status, 403);
  assert.equal((await pay("/consultancy/admin/requests")).status, 401);
});
