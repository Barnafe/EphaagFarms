import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/client.js";

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function loadScript(src, ready) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    const done = () => (ready() ? resolve() : setTimeout(done, 100));
    if (existing) { done(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = done; s.onerror = () => reject(new Error("The video player could not load."));
    document.head.appendChild(s);
  });
}

function loadYouTube() {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    loadScript("https://www.youtube.com/iframe_api", () => !!window.YT?.Player).catch(reject);
  });
}

// One open lesson. While a video is really playing (YouTube or Vimeo), or while a document or other video is open on a
// visible screen, this reports "still here" every few seconds. The server does the counting, so the number below is
// only a mirror of what it has recorded.
export default function LessonTracker({ courseId, lesson, onMet, onError }) {
  const t = lesson.tracking;
  const [spent, setSpent] = useState(t.secondsSpent);
  const [required, setRequired] = useState(t.requiredSeconds);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const hostRef = useRef(null);
  const state = useRef({ playing: false, duration: null, met: t.met });
  const callbacks = useRef({ onMet, onError });
  callbacks.current = { onMet, onError };

  // the reporting loop
  useEffect(() => {
    let stopped = false;
    async function beat() {
      const visible = document.visibilityState === "visible";
      const active = t.mode === "player" ? state.current.playing && visible : visible;
      try {
        const r = await apiFetch(`/corpers/courses/${courseId}/lessons/${lesson.id}/activity`, {
          method: "POST", body: { active, ...(state.current.duration ? { duration: Math.round(state.current.duration) } : {}) },
        });
        if (stopped) return;
        setSpent(r.secondsSpent); setRequired(r.requiredSeconds);
        if (r.met && !state.current.met) { state.current.met = true; callbacks.current.onMet?.(); }
      } catch (err) { if (!stopped) callbacks.current.onError?.(err); }
    }
    beat();
    const id = setInterval(beat, t.beatSeconds * 1000);
    return () => { stopped = true; clearInterval(id); };
  }, [courseId, lesson.id, t.mode, t.beatSeconds]);

  // the embedded player
  useEffect(() => {
    if (t.mode !== "player") return undefined;
    let player = null; let cancelled = false;
    const set = (p) => { state.current.playing = p; setPlaying(p); };
    (async () => {
      try {
        if (t.provider === "youtube") {
          const YT = await loadYouTube();
          if (cancelled || !hostRef.current) return;
          const el = document.createElement("div"); hostRef.current.replaceChildren(el);
          player = new YT.Player(el, {
            videoId: t.embedId, width: "100%", height: "100%", playerVars: { rel: 0, playsinline: 1 },
            events: {
              onReady: (e) => { state.current.duration = e.target.getDuration(); },
              onStateChange: (e) => { set(e.data === YT.PlayerState.PLAYING); if (!state.current.duration) state.current.duration = e.target.getDuration(); },
            },
          });
        } else if (t.provider === "vimeo") {
          await loadScript("https://player.vimeo.com/api/player.js", () => !!window.Vimeo?.Player);
          if (cancelled || !hostRef.current) return;
          const el = document.createElement("div"); hostRef.current.replaceChildren(el);
          player = new window.Vimeo.Player(el, { url: `https://vimeo.com/${t.embedId}${t.embedHash ? `/${t.embedHash}` : ""}`, responsive: true });
          player.on("play", () => set(true)); player.on("pause", () => set(false)); player.on("ended", () => set(false));
          player.getDuration().then((d) => { state.current.duration = d; }).catch(() => {});
        }
      } catch (err) { if (!cancelled) setPlayerError(err.message); }
    })();
    return () => { cancelled = true; try { player?.destroy?.(); } catch { /* the player is already gone */ } };
  }, [t.mode, t.provider, t.embedId, t.embedHash]);

  const pct = Math.min(100, Math.round((spent / Math.max(1, required)) * 100));
  return (
    <div className="mt-3 space-y-3" data-testid="lesson-tracker">
      {t.mode === "player" && (
        <div className="aspect-video w-full overflow-hidden rounded-card bg-black" ref={hostRef} data-testid="video-player" />
      )}
      {playerError && <p className="text-sm text-red-700" role="alert">{playerError}</p>}
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-soil-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Time counted">
          <div className="h-full bg-[#2c6b2f]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-ink-800" data-testid="time-counted">
          Time counted: {mmss(spent)} of {mmss(required)}.{" "}
          {spent >= required
            ? "That is enough. You can mark this lesson complete."
            : t.mode === "player"
              ? (playing ? "Counting while the video plays." : "Time counts only while the video is playing and this page is showing.")
              : "Time counts while this page is showing. Keep it open."}
        </p>
      </div>
    </div>
  );
}
