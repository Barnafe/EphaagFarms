// Phase 13: how long a corps member must really spend on a lesson before it can be marked complete.
// Pure functions (no database), covered by test/lessonTime.test.mjs.

export const TIME_RULES = {
  videoWatchShare: 0.8,        // a video counts when 80 percent of its length was really watched
  unknownVideoMinSeconds: 60,  // when the length is only reported by the member's phone, never ask for less than this
  noLengthSeconds: 120,        // an old video lesson with no known length at all
  defaultDocumentSeconds: 60,  // a document with no time set by the admin
  maxSeconds: 6 * 3600,
  beatSeconds: 10,             // how often the screen reports "still here"
  maxCreditPerBeat: 15,        // the most one report can add
  maxGapSeconds: 30,           // a longer silence means the screen was closed or asleep: nothing is credited for the gap
};

/** YouTube or Vimeo link -> { provider, id }, anything else -> null (it cannot be watched inside our page). */
export function parseVideoEmbed(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1];
    return /^[\w-]{11}$/.test(id || "") ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    let id = u.searchParams.get("v");
    if (!id) {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
      id = m ? m[1] : null;
    }
    return /^[\w-]{11}$/.test(id || "") ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/\/(?:video\/)?(\d{5,12})(?:\/([0-9a-f]{8,12}))?/i);
    if (!m) return null;
    const hash = m[2] || u.searchParams.get("h") || null;
    return { provider: "vimeo", id: m[1], ...(hash ? { hash } : {}) };
  }
  return null;
}

/** Seconds the member must spend on a lesson, or 0 when the lesson has no time rule (a live session). */
export function requiredSeconds(lesson, reportedDuration = null) {
  if (lesson.kind === "document") {
    const own = Number(lesson.min_seconds);
    return Number.isFinite(own) && own > 0 ? Math.round(own) : TIME_RULES.defaultDocumentSeconds;
  }
  if (lesson.kind === "video") {
    const admin = Number(lesson.duration_seconds);
    if (Number.isFinite(admin) && admin > 0) return Math.max(1, Math.round(admin * TIME_RULES.videoWatchShare));
    const rep = Number(reportedDuration);
    if (Number.isFinite(rep) && rep > 0) return Math.max(TIME_RULES.unknownVideoMinSeconds, Math.round(Math.min(rep, TIME_RULES.maxSeconds) * TIME_RULES.videoWatchShare));
    return TIME_RULES.noLengthSeconds;
  }
  return 0;
}

/** How many seconds one "still here" report adds. Only a screen that is really playing or open, reporting on time, earns time. */
export function creditFor(elapsedSeconds, active) {
  if (!active) return 0;
  const e = Number(elapsedSeconds);
  if (!Number.isFinite(e) || e <= 0) return 0;
  if (e > TIME_RULES.maxGapSeconds) return 0;
  return Math.min(e, TIME_RULES.maxCreditPerBeat);
}

export const timeMet = (spent, required) => required <= 0 || Number(spent) >= required;
