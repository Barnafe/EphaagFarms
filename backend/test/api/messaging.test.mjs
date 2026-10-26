// Phase 16 — email and SMS
import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { api, call, API, db, MAIL, newUser, loginAdmin, waitForMessage, waitStatus, mailReset, mailState, sleep, uniq } from "../helpers/api.mjs";

after(() => db.end());

function snsSigned(message, { privateKey = process.env.SNS_TEST_PRIVATE_KEY, tamper = false } = {}) {
  const m = { Type: "Notification", MessageId: crypto.randomUUID(), TopicArn: "arn:aws:sns:us-east-1:1:ses", Message: JSON.stringify(message), Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem" };
  const toSign = ["Message", "MessageId", "Timestamp", "TopicArn", "Type"].map((k) => `${k}\n${m[k]}\n`).join("");
  const s = crypto.createSign("RSA-SHA256"); s.update(toSign);
  m.Signature = s.sign(privateKey, "base64");
  if (tamper) m.Message = m.Message.replace("Permanent", "Transient");
  return m;
}
const post = (body) => call(API, "/api/messaging/ses-events", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain; charset=UTF-8" } });

// Let anything already waiting (alerts, welcome mails) go out first, so a
// simulated outage hits the message under test and nothing else.
async function drain(admin) {
  for (let i = 0; i < 3; i++) { await api("/system/jobs/message-queue/run", { method: "POST", token: admin }); await sleep(250); }
}

test("an email is queued, sent through the provider and recorded", async () => {
  await mailReset();
  const u = await newUser();
  const msg = await waitForMessage("to_address = $1 AND template = 'welcome'", [u.email]);
  assert.ok(msg, "welcome email queued");
  const done = await waitStatus(msg.id, "sent");
  assert.equal(done.status, "sent");
  assert.match(done.provider_id, /fake-ses/);
  const state = await mailState();
  const got = state.ses.find((m) => m.to.includes(u.email));
  assert.ok(got, "provider received it");
  assert.equal(got.subject, "Welcome to EPHAAG Farms");
  assert.match(msg.body_html, /EPHAAG FARMS/);   // branded wrapper
  assert.ok(msg.body_text && !msg.body_text.includes("<"), "plain-text version exists");
});

test("a provider outage is retried with backoff and delivered once it recovers", async () => {
  const admin = await loginAdmin();
  await drain(admin);
  await mailReset();
  await fetch(`${MAIL}/__fail?ses=1000`);
  const to = `retry${uniq()}@example.test`;
  const r = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "email", to } });
  assert.equal(r.status, 200);
  assert.equal(r.data.message.status, "queued", "first attempt failed, stays queued");
  const row = (await db.query("SELECT attempts, next_attempt_at, last_error FROM messages WHERE id=$1", [r.data.message.id])).rows[0];
  assert.equal(row.attempts, 1);
  assert.ok(new Date(row.next_attempt_at) > new Date(Date.now() + 30000), "backoff scheduled");
  assert.match(row.last_error, /outage|500/i);
  await fetch(`${MAIL}/__fail?ses=0`); // the provider recovers
  // time passes: make it due, run the queue job
  await db.query("UPDATE messages SET next_attempt_at = now() - interval '1 second' WHERE id=$1", [r.data.message.id]);
  const run = await api("/system/jobs/message-queue/run", { method: "POST", token: admin });
  assert.equal(run.data.status, "ok");
  assert.equal((await waitStatus(r.data.message.id, "sent")).status, "sent");
});

test("after 5 failed attempts a message is marked failed and can be resent", async () => {
  const admin = await loginAdmin();
  await fetch(`${MAIL}/__fail?ses=50`);
  const to = `fail${uniq()}@example.test`;
  const r = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "email", to } });
  const id = r.data.message.id;
  for (let i = 0; i < 6; i++) {
    await db.query("UPDATE messages SET next_attempt_at = now() - interval '1 second' WHERE id=$1 AND status='queued'", [id]);
    await api("/system/jobs/message-queue/run", { method: "POST", token: admin });
  }
  const failed = (await db.query("SELECT status, attempts FROM messages WHERE id=$1", [id])).rows[0];
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 5);
  await fetch(`${MAIL}/__reset`);
  const re = await api(`/messaging/${id}/resend`, { method: "POST", token: admin });
  assert.equal(re.status, 200);
  assert.equal(re.data.message.status, "sent");
  // sent messages cannot be "resent"
  assert.equal((await api(`/messaging/${id}/resend`, { method: "POST", token: admin })).status, 404);
});

test("a permanent bounce suppresses the address; a bad signature is rejected and alerts", async () => {
  const admin = await loginAdmin();
  await api("/system/alert-settings", { method: "PUT", token: admin, body: { alertSmsPhone: "08031234567" } });
  const victim = `bounce${uniq()}@example.test`;
  const ev = { notificationType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: victim, diagnosticCode: "550 no such user" }] } };

  // forged / tampered -> 403, logged, alert raised
  const bad = await post(snsSigned(ev, { tamper: true }));
  assert.equal(bad.status, 403);
  const wh = await db.query("SELECT 1 FROM webhook_events WHERE source='ses' AND status='bad_signature'");
  assert.ok(wh.rowCount >= 1);
  const alertMsg = await waitForMessage("template = 'job_alert' AND subject ILIKE '%bad signature%'", []);
  assert.ok(alertMsg, "admins emailed about the bad signature");
  const smsAlert = await waitForMessage("channel='sms' AND template = 'job_alert'", []);
  assert.ok(smsAlert, "named person gets an SMS");
  assert.equal(smsAlert.to_address, "+2348031234567");
  assert.equal((await db.query("SELECT 1 FROM email_suppressions WHERE address=$1", [victim])).rowCount, 0, "tampered event must not suppress");

  const good = await post(snsSigned(ev));
  assert.equal(good.status, 200);
  assert.equal((await db.query("SELECT 1 FROM email_suppressions WHERE address=$1", [victim])).rowCount, 1);

  // new mail to that address is not sent, and the admin sees it
  const r = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "email", to: victim } });
  assert.equal(r.data.message.status, "suppressed");
  const list = await api("/messaging?status=suppressed", { token: admin });
  assert.ok(list.data.suppressions.some((s) => s.address === victim));
  assert.equal((await api(`/messaging/${r.data.message.id}/resend`, { method: "POST", token: admin })).status, 409);
  // admin removes it
  assert.equal((await api(`/messaging/suppressions/${encodeURIComponent(victim)}`, { method: "DELETE", token: admin })).status, 200);
});

test("complaints suppress too; transient bounces do not", async () => {
  const a = `complain${uniq()}@example.test`, b = `soft${uniq()}@example.test`;
  await post(snsSigned({ notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: a }] } }));
  await post(snsSigned({ notificationType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: b }] } }));
  assert.equal((await db.query("SELECT 1 FROM email_suppressions WHERE address=$1", [a])).rowCount, 1);
  assert.equal((await db.query("SELECT 1 FROM email_suppressions WHERE address=$1", [b])).rowCount, 0);
});

test("SMS: numbers are validated and normalised to +234, length capped at 160, daily limit per person", async () => {
  const admin = await loginAdmin();
  assert.equal((await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "sms", to: "12345" } })).status, 400);
  for (const [input, expected] of [["08031112222", "+2348031112222"], ["+234 803 111 2222", "+2348031112222"], ["2348031112222", "+2348031112222"], ["8031112222", "+2348031112222"]]) {
    const r = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "sms", to: input } });
    assert.equal(r.status, 200);
    const row = (await db.query("SELECT to_address, body_text FROM messages WHERE id=$1", [r.data.message.id])).rows[0];
    assert.equal(row.to_address, expected);
    assert.ok(row.body_text.length <= 160);
  }
  // 5 per day is the default limit; the number above already has 4
  const fifth = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "sms", to: "08031112222" } });
  assert.equal(fifth.data.message.status, "sent");
  const sixth = await api("/messaging/test-send", { method: "POST", token: admin, body: { channel: "sms", to: "08031112222" } });
  assert.equal(sixth.data.message.status, "suppressed");
  assert.match(sixth.data.message.last_error, /Daily SMS limit/);
  assert.equal((await mailState()).sms.filter((s) => s.to === "2348031112222").length, 5, "provider got exactly 5");
});

test("templates list and preview render branded email and sms text", async () => {
  const admin = await loginAdmin();
  const list = await api("/messaging/templates", { token: admin });
  const names = list.data.templates.map((t) => t.name);
  for (const n of ["welcome", "password_reset", "account_locked", "job_alert", "generic"]) assert.ok(names.includes(n), n);
  const p = await api("/messaging/templates/account_locked/preview", { token: admin });
  assert.equal(p.status, 200);
  assert.match(p.data.html, /EPHAAG FARMS/);
  assert.match(p.data.sms, /locked/);
  assert.ok(p.data.sms.length <= 160);
  assert.equal((await api("/messaging/templates/nope/preview", { token: admin })).status, 404);
  assert.equal((await api("/messaging", { token: (await newUser()).token })).status, 403);
});

test("the messages log filters by status and channel", async () => {
  const admin = await loginAdmin();
  const sent = await api("/messaging?status=sent&channel=email&limit=5", { token: admin });
  assert.equal(sent.status, 200);
  assert.ok(sent.data.messages.length > 0 && sent.data.messages.every((m) => m.status === "sent" && m.channel === "email"));
  assert.ok(Array.isArray(sent.data.counts));
});
