// Phase 13 rules, no database: node --test backend/test/lessonTime.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoEmbed, requiredSeconds, creditFor, timeMet, TIME_RULES } from "../src/utils/lessonTime.js";

test("YouTube and Vimeo links are recognised in their usual shapes; other links cannot be played inside the page", () => {
  assert.deepEqual(parseVideoEmbed("https://youtu.be/dQw4w9WgXcQ"), { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ"), { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ"), { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoEmbed("https://vimeo.com/123456789"), { provider: "vimeo", id: "123456789" });
  assert.deepEqual(parseVideoEmbed("https://vimeo.com/123456789/abcdef1234"), { provider: "vimeo", id: "123456789", hash: "abcdef1234" });
  assert.deepEqual(parseVideoEmbed("https://player.vimeo.com/video/123456789?h=abcdef1234"), { provider: "vimeo", id: "123456789", hash: "abcdef1234" });
  for (const bad of ["https://example.com/v", "https://youtube.com/watch?v=short", "https://youtube.com/", "https://evil.test/youtu.be/dQw4w9WgXcQ", "not a link", "", null, undefined, "https://vimeo.com/channels/staffpicks"]) {
    assert.equal(parseVideoEmbed(bad), null, String(bad));
  }
});

test("a video needs 80 percent of the length the admin entered; a document needs its own time or a minute", () => {
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: 600 }), 480);
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: 10 }), 8);
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: 600 }, 5), 480, "the admin's length wins over what a phone reports");
  assert.equal(requiredSeconds({ kind: "document", min_seconds: 120 }), 120);
  assert.equal(requiredSeconds({ kind: "document", min_seconds: null }), 60);
  assert.equal(requiredSeconds({ kind: "document" }), 60);
  assert.equal(requiredSeconds({ kind: "live" }), 0);
});

test("an old video with no length uses the reported length but never less than a minute, and 2 minutes with nothing at all", () => {
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: null }, 600), 480);
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: null }, 20), TIME_RULES.unknownVideoMinSeconds, "a phone claiming 20 seconds cannot make it easy");
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: null }, 99999999), Math.round(6 * 3600 * 0.8));
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: null }), TIME_RULES.noLengthSeconds);
  assert.equal(requiredSeconds({ kind: "video", duration_seconds: null }, "abc"), TIME_RULES.noLengthSeconds);
});

test("time is credited only for a screen that is active and reporting on time, never more than the clock allows", () => {
  assert.equal(creditFor(10, true), 10);
  assert.equal(creditFor(0.4, true), 0.4, "rapid reports add only the real time between them");
  assert.equal(creditFor(15, true), 15);
  assert.equal(creditFor(20, true), 15, "one report adds at most 15 seconds");
  assert.equal(creditFor(31, true), 0, "a long silence is not credited");
  assert.equal(creditFor(10, false), 0, "a paused video or a hidden screen earns nothing");
  for (const bad of [0, -5, NaN, undefined, null, "x"]) assert.equal(creditFor(bad, true), 0, String(bad));
});

test("timeMet", () => {
  assert.equal(timeMet(480, 480), true); assert.equal(timeMet(479.9, 480), false);
  assert.equal(timeMet(0, 0), true, "a lesson with no time rule is always met");
});
