// Phase 13: corps learning no longer runs on honour. Videos need real watch time, documents a minimum time open,
// live sessions stay as they were, and quiz rules are unchanged.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newCorper, newFarmer, loginAdmin } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let admin, member, course, lessons;
const A = (path, opts = {}) => api(`/rtc/admin${path}`, { token: admin, ...opts });
const M = (path, token = member.token, opts = {}) => api(`/corpers${path}`, { token, ...opts });
async function payFor(m) {
  await db.query(`INSERT INTO corper_payments (reference, user_id, amount, status, provider, confirmed_at) VALUES ($1,$2,5000,'paid','manual',now())`, [`CPAY-T-${m.id.slice(0, 8)}`, m.id]);
}
const beat = (lessonId, body = { active: true }, token = member.token) => M(`/courses/${course.id}/lessons/${lessonId}/activity`, token, { method: "POST", body });
const complete = (lessonId, token = member.token) => M(`/courses/${course.id}/lessons/${lessonId}/complete`, token, { method: "POST", body: {} });
const detail = async (token = member.token) => (await M(`/courses/${course.id}`, token)).data;
const lesson = async (name) => (await detail()).lessons.find((l) => l.title === name);
// move the last "still here" report back in time so the next report sees `seconds` of real time passing
const ago = (lessonId, seconds, m = member) => db.query("UPDATE corper_lesson_activity SET last_beat_at = now() - ($3 || ' seconds')::interval WHERE user_id = $1 AND lesson_id = $2", [m.id, lessonId, String(seconds)]);
const spent = async (lessonId, m = member) => Number((await db.query("SELECT seconds_counted FROM corper_lesson_activity WHERE user_id = $1 AND lesson_id = $2", [m.id, lessonId])).rows[0]?.seconds_counted ?? 0);

test("setup: a corps course with a short video, a YouTube video, a document, a live session and a quiz", async () => {
  admin = await loginAdmin();
  const c = await A("/courses", { method: "POST", body: { title: `Timing ${Date.now()}`, description: "t", audience: "corps" } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  course = c.data.course;
  const mk = async (body) => { const r = await A(`/courses/${course.id}/lessons`, { method: "POST", body }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.lesson; };
  lessons = {};
  lessons.short = await mk({ title: "Short video", kind: "video", url: "https://example.com/v", durationSeconds: 10 });
  lessons.yt = await mk({ title: "YouTube video", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", durationSeconds: 600 });
  const f = new FormData(); f.append("title", "Handout"); f.append("kind", "document"); f.append("minSeconds", "5");
  f.append("material", new Blob([PDF], { type: "application/pdf" }), "handout.pdf");
  const d = await A(`/courses/${course.id}/lessons`, { method: "POST", body: f });
  assert.equal(d.status, 201, JSON.stringify(d.data)); lessons.doc = d.data.lesson;
  const f2 = new FormData(); f2.append("title", "Default handout"); f2.append("kind", "document");
  f2.append("material", new Blob([PDF], { type: "application/pdf" }), "h2.pdf");
  lessons.doc2 = (await A(`/courses/${course.id}/lessons`, { method: "POST", body: f2 })).data.lesson;
  lessons.live = await mk({ title: "Live Q&A", kind: "live", url: "https://example.com/live", scheduledAt: new Date(Date.now() - 3600e3).toISOString() });
  const q = await A(`/courses/${course.id}/questions`, { method: "POST", body: { prompt: "Q?", explanation: "E", options: [{ text: "RIGHT", isCorrect: true }, { text: "WRONG" }] } });
  assert.equal(q.status, 201, JSON.stringify(q.data));
  let ap = await A(`/courses/${course.id}/approve`, { method: "POST", body: {} });
  if (ap.status === 409) ap = await A(`/courses/${course.id}/approve`, { method: "POST", body: { confirmImpact: true } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  member = await newCorper(); await payFor(member);
});

test("the admin must say how long a video is; a document's minimum time is checked; both are kept on the lesson", async () => {
  const bad = (body) => A(`/courses/${course.id}/lessons`, { method: "POST", body });
  const base = { title: "x", kind: "video", url: "https://example.com/v" };
  assert.equal((await bad(base)).status, 400, "no length");
  assert.equal((await bad({ ...base, durationSeconds: 3 })).status, 400, "too short");
  assert.equal((await bad({ ...base, durationSeconds: 99999 })).status, 400, "too long");
  assert.equal((await bad({ ...base, durationSeconds: "abc" })).status, 400);
  const f = (min) => { const x = new FormData(); x.append("title", "d"); x.append("kind", "document"); x.append("minSeconds", min); x.append("material", new Blob([PDF], { type: "application/pdf" }), "a.pdf"); return x; };
  assert.equal((await A(`/courses/${course.id}/lessons`, { method: "POST", body: f("2") })).status, 400);
  assert.equal((await A(`/courses/${course.id}/lessons`, { method: "POST", body: f("99999") })).status, 400);
  assert.equal(lessons.short.durationSeconds, 10); assert.equal(lessons.doc.minSeconds, 5);
  // editing without saying the length again keeps it
  const u = await A(`/courses/${course.id}/lessons/${lessons.yt.id}`, { method: "PUT", body: { title: "YouTube video", notes: "now with notes" } });
  assert.equal(u.status, 200, JSON.stringify(u.data)); assert.equal(u.data.lesson.durationSeconds, 600);
});

test("the member sees what each lesson asks for; a live session has no time rule", async () => {
  const d = await detail();
  const yt = d.lessons.find((l) => l.title === "YouTube video").tracking;
  assert.equal(yt.mode, "player"); assert.equal(yt.provider, "youtube"); assert.equal(yt.embedId, "dQw4w9WgXcQ"); assert.equal(yt.requiredSeconds, 480); assert.equal(yt.secondsSpent, 0);
  const sh = d.lessons.find((l) => l.title === "Short video");
  assert.equal(sh.tracking.mode, "timer"); assert.equal(sh.tracking.requiredSeconds, 8); assert.equal(sh.canComplete, false);
  assert.equal(d.lessons.find((l) => l.title === "Handout").tracking.requiredSeconds, 5);
  assert.equal(d.lessons.find((l) => l.title === "Default handout").tracking.requiredSeconds, 60, "a document with no time set asks for a minute");
  const live = d.lessons.find((l) => l.title === "Live Q&A");
  assert.equal(live.tracking, null); assert.equal(live.canComplete, true);
});

test("completing early is refused with how much time is left; nothing is counted", async () => {
  const r = await complete(lessons.short.id);
  assert.equal(r.status, 400); assert.equal(r.data.code, "LESSON_TIME_NOT_MET");
  assert.equal(r.data.details.requiredSeconds, 8); assert.equal(r.data.details.remainingSeconds, 8);
  assert.equal((await detail()).progress.lessonsDone, 0);
});

test("time is counted only between real, active reports; rapid, paused or late reports cannot speed it up", async () => {
  const id = lessons.short.id;
  assert.equal((await beat(id, { active: true })).status, 200);
  for (let i = 0; i < 40; i++) await beat(id, { active: true });          // forty reports in a burst
  assert.ok(await spent(id) < 3, `a burst adds only the real time that passed (${await spent(id)})`);
  await ago(id, 10);
  const paused = await beat(id, { active: false });                        // a paused video earns nothing and does not restart the clock
  assert.equal(paused.status, 200);
  const before = await spent(id);
  await ago(id, 10);
  const r = await beat(id, { active: true });
  assert.ok(await spent(id) - before >= 9 && await spent(id) - before <= 10.5, "ten real seconds are credited");
  assert.equal(r.data.met, true, `${JSON.stringify(r.data)}`);
  // a long silence (screen asleep) is not credited
  const id2 = lessons.yt.id;
  await beat(id2); await ago(id2, 120);
  const gap = await beat(id2); assert.equal(gap.data.secondsSpent, 0);
  // an absurd report is capped to 15 seconds
  await ago(id2, 29); const capped = await beat(id2); assert.equal(capped.data.secondsSpent, 15);
});

test("once the time is met the lesson can be completed, once and for all; it counts toward the course", async () => {
  const done = await complete(lessons.short.id);
  assert.equal(done.status, 200, JSON.stringify(done.data)); assert.equal(done.data.completed, true);
  assert.equal((await complete(lessons.short.id)).status, 200, "completing twice is harmless");
  const d = await detail();
  assert.equal(d.progress.lessonsDone, 1);
  assert.equal(d.lessons.find((l) => l.title === "Short video").completed, true);
  // the admin later makes the video longer: what the member already did does not change
  assert.equal((await A(`/courses/${course.id}/lessons/${lessons.short.id}`, { method: "PUT", body: { title: "Short video", durationSeconds: 3600 } })).status, 200);
  const again = await detail();
  assert.equal(again.lessons.find((l) => l.title === "Short video").completed, true);
  assert.equal(again.lessons.find((l) => l.title === "Short video").canComplete, true);
  assert.equal(again.progress.lessonsDone, 1);
});

test("documents need their minimum time open; a quiz stays locked until every lesson is done", async () => {
  const id = lessons.doc.id;
  assert.equal((await complete(id)).data.code, "LESSON_TIME_NOT_MET");
  await beat(id); await ago(id, 6); await beat(id);
  assert.equal((await complete(id)).status, 200);
  const doc2 = lessons.doc2.id;
  const early = await complete(doc2); assert.equal(early.data.details.requiredSeconds, 60);
  await db.query("INSERT INTO corper_lesson_activity (user_id, lesson_id, course_id, seconds_counted) VALUES ($1,$2,$3,61) ON CONFLICT (user_id, lesson_id) DO UPDATE SET seconds_counted = 61", [member.id, doc2, course.id]);
  assert.equal((await complete(doc2)).status, 200);
  const q = await M(`/courses/${course.id}/quiz`);
  assert.equal(q.status, 403); assert.equal(q.data.code, "QUIZ_LOCKED");
});

test("a live session is unchanged: no timer, and it can be completed once it has started", async () => {
  assert.equal((await beat(lessons.live.id)).data.code, "NOT_TRACKED");
  assert.equal((await complete(lessons.live.id)).status, 200);
  const future = await A(`/courses/${course.id}/lessons`, { method: "POST", body: { title: "Later live", kind: "live", url: "https://example.com/l2", scheduledAt: new Date(Date.now() + 86400e3).toISOString() } });
  assert.equal(future.status, 201);
  assert.equal((await complete(future.data.lesson.id)).data.code, "LIVE_NOT_STARTED");
  await A(`/courses/${course.id}/lessons/${future.data.lesson.id}`, { method: "DELETE" });
});

test("quiz rules are unchanged: unlimited retakes after the lessons are done", async () => {
  await db.query("INSERT INTO corper_lesson_activity (user_id, lesson_id, course_id, seconds_counted) VALUES ($1,$2,$3,9999) ON CONFLICT (user_id, lesson_id) DO UPDATE SET seconds_counted = 9999", [member.id, lessons.yt.id, course.id]);
  assert.equal((await complete(lessons.yt.id)).status, 200);
  const q = await M(`/courses/${course.id}/quiz`);
  assert.equal(q.status, 200, JSON.stringify(q.data));
  const qs = q.data.questions ?? q.data.quiz?.questions;
  const right = (qq) => qq.options.find((o) => o.text === "RIGHT").id;
  for (let i = 0; i < 3; i++) {
    const body = { answers: qs.map((qq) => ({ questionId: qq.id, optionId: i === 1 ? qq.options.find((o) => o.text !== "RIGHT").id : right(qq) })), clientToken: `try-${i}-${Date.now()}` };
    const r = await M(`/courses/${course.id}/quiz/attempts`, member.token, { method: "POST", body });
    assert.equal(r.status, 201, `${i}: ${JSON.stringify(r.data)}`);
  }
  assert.equal((await M(`/courses/${course.id}/quiz/attempts`)).data.attempts.length, 3, "three attempts are kept");
});

test("activity reports are for paid corps members and real lessons only", async () => {
  assert.equal((await beat(lessons.short.id, { active: true }, "")).status, 401);
  const farmer = await newFarmer();
  assert.equal((await beat(lessons.short.id, { active: true }, farmer.token)).status, 403);
  const unpaid = await newCorper();
  assert.equal((await beat(lessons.short.id, { active: true }, unpaid.token)).status, 402);
  assert.equal((await beat("00000000-0000-4000-8000-000000000000")).status, 404);
  assert.equal((await beat("nope")).status, 404);
  assert.equal((await M("/courses/00000000-0000-4000-8000-000000000000/lessons/00000000-0000-4000-8000-000000000000/activity", member.token, { method: "POST", body: { active: true } })).status, 404);
  // one member's time never counts for another
  const other = await newCorper(); await payFor(other);
  const c = await M(`/courses/${course.id}/lessons/${lessons.doc.id}/complete`, other.token, { method: "POST", body: {} });
  assert.equal(c.data.code, "LESSON_TIME_NOT_MET");
});
