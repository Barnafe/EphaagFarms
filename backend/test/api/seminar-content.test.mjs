// Seminars are videos and slides. The system marks items and the whole topic complete.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newFarmer, loginAdmin } from "../helpers/api.mjs";

after(() => db.end());

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const slideForm = (title, n) => {
  const f = new FormData();
  f.append("title", title); f.append("kind", "slides");
  for (let i = 0; i < n; i += 1) f.append("slides", new Blob([PNG], { type: "image/png" }), `slide-${i + 1}.png`);
  return f;
};

test("a seminar topic completes by itself once its video and slides are done", async () => {
  const admin = await loginAdmin();
  const farmer = await newFarmer();

  const created = await api("/rtc/admin/courses", { method: "POST", token: admin, body: { title: "Seminar topic one", description: "Test", audience: "general" } });
  assert.equal(created.status, 201);
  const courseId = created.data.course.id;

  // bad input is refused
  const base = `/rtc/admin/courses/${courseId}/seminar-items`;
  assert.equal((await api(base, { method: "POST", token: admin, body: { title: "Bad link", kind: "video", videoUrl: "not a link" } })).status, 400);
  assert.equal((await api(base, { method: "POST", token: admin, body: { title: "No images", kind: "slides" } })).status, 400);
  assert.equal((await api(base, { method: "POST", token: admin, body: { title: "", kind: "video", videoUrl: "https://youtu.be/dQw4w9WgXcQ" } })).status, 400);

  const video = await api(base, { method: "POST", token: admin, body: { title: "Watch this", kind: "video", videoUrl: "https://youtu.be/dQw4w9WgXcQ" } });
  assert.equal(video.status, 201);
  const slides = await api(base, { method: "POST", token: admin, body: slideForm("Read these", 3) });
  assert.equal(slides.status, 201, JSON.stringify(slides.data));

  // not visible to farmers until approved
  assert.equal((await api(`/rtc/seminar-items/${video.data.id}/complete`, { method: "POST", token: farmer.token })).status, 404);
  assert.equal((await api(`/rtc/admin/courses/${courseId}/approve`, { method: "POST", token: admin })).status, 200);

  const list = await api("/rtc/courses", { token: farmer.token });
  const mine = list.data.courses.find((c) => c.id === courseId);
  assert.equal(mine.totalItems, 2);
  assert.equal(mine.completedItems, 0);
  assert.equal(mine.completed, false);
  assert.equal(mine.items[0].kind, "video");
  assert.equal(mine.items[1].slides.length, 3);

  // finishing the video alone does not finish the topic
  const v = await api(`/rtc/seminar-items/${video.data.id}/complete`, { method: "POST", token: farmer.token });
  assert.equal(v.status, 200);
  assert.equal(v.data.courseCompleted, false);
  // doing it twice changes nothing
  assert.equal((await api(`/rtc/seminar-items/${video.data.id}/complete`, { method: "POST", token: farmer.token })).data.courseCompleted, false);

  // the last item completes the whole topic
  const s = await api(`/rtc/seminar-items/${slides.data.id}/complete`, { method: "POST", token: farmer.token });
  assert.equal(s.data.courseCompleted, true);
  const after1 = (await api("/rtc/courses", { token: farmer.token })).data.courses.find((c) => c.id === courseId);
  assert.equal(after1.completed, true);
  assert.equal(after1.completedItems, 2);
  const { rows } = await db.query("SELECT course_pct FROM farmer_profiles WHERE user_id = $1", [farmer.id]);
  assert.ok(Number(rows[0].course_pct) > 0);

  // another farmer is not affected
  const other = await newFarmer();
  const theirs = (await api("/rtc/courses", { token: other.token })).data.courses.find((c) => c.id === courseId);
  assert.equal(theirs.completed, false);
  assert.equal(theirs.completedItems, 0);

  // only the admin can add or remove items; removing an item works
  assert.equal((await api(base, { method: "POST", token: farmer.token, body: { title: "x", kind: "video", videoUrl: "https://youtu.be/abc" } })).status, 403);
  assert.equal((await api(`/rtc/admin/seminar-items/${video.data.id}`, { method: "DELETE", token: admin })).status, 200);
  assert.equal((await api(`/rtc/admin/courses/${courseId}/seminar-items`, { token: admin })).data.items.length, 1);
});

test("units for declared produce include Others", async () => {
  const farmer = await newFarmer();
  const r = await api("/farmers/me/declarations", { method: "POST", token: farmer.token, body: { crop: "Maize", quantity: 5, unit: "others" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await api("/farmers/me/declarations", { method: "POST", token: farmer.token, body: { crop: "Maize", quantity: 5, unit: "boxes" } })).status, 400);
});
