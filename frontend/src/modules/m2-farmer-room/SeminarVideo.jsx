import { useEffect, useRef } from "react";

// Plays a seminar video and tells the page the moment it has been watched to the end.
// Works with YouTube, Vimeo and direct video files.

function parseVideo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return { type: "youtube", id: u.pathname.slice(1).split("/")[0] };
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") return { type: "youtube", id: u.searchParams.get("v") };
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
      if (m) return { type: "youtube", id: m[1] };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = u.pathname.match(/(\d{5,})/);
      if (m) return { type: "vimeo", id: m[1] };
    }
  } catch { /* fall through to a direct file */ }
  return { type: "file" };
}

let ytPromise;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytPromise;
}

let vimeoPromise;
function loadVimeo() {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (!vimeoPromise) {
    vimeoPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://player.vimeo.com/api/player.js";
      s.onload = () => resolve(window.Vimeo);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return vimeoPromise;
}

function YouTubeVideo({ id, onEnded }) {
  const box = useRef(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  useEffect(() => {
    let player;
    let cancelled = false;
    const host = document.createElement("div");
    box.current.appendChild(host);
    loadYouTube().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(host, {
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, playsinline: 1 },
        events: { onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) ended.current?.(); } },
      });
    });
    return () => { cancelled = true; try { player?.destroy(); } catch { /* already gone */ } host.remove(); };
  }, [id]);
  return <div ref={box} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />;
}

function VimeoVideo({ id, onEnded }) {
  const frame = useRef(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  useEffect(() => {
    let player;
    let cancelled = false;
    loadVimeo().then((Vimeo) => {
      if (cancelled || !frame.current) return;
      player = new Vimeo.Player(frame.current);
      player.on("ended", () => ended.current?.());
    }).catch(() => {});
    return () => { cancelled = true; try { player?.destroy(); } catch { /* already gone */ } };
  }, [id]);
  return <iframe ref={frame} title="Seminar video" src={`https://player.vimeo.com/video/${id}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />;
}

function FileVideo({ url, done, onEnded }) {
  const furthest = useRef(0);
  return (
    <video
      className="h-full w-full"
      src={url}
      controls
      playsInline
      preload="metadata"
      onTimeUpdate={(e) => { if (!e.currentTarget.seeking && e.currentTarget.currentTime > furthest.current) furthest.current = e.currentTarget.currentTime; }}
      onSeeking={(e) => { const v = e.currentTarget; if (!done && v.currentTime > furthest.current + 1.5) v.currentTime = furthest.current; }}
      onEnded={onEnded}
    />
  );
}

export default function SeminarVideo({ url, done, onEnded }) {
  const v = parseVideo(url);
  return (
    <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
      {v.type === "youtube" && v.id ? <YouTubeVideo id={v.id} onEnded={onEnded} />
        : v.type === "vimeo" ? <VimeoVideo id={v.id} onEnded={onEnded} />
        : <FileVideo url={url} done={done} onEnded={onEnded} />}
    </div>
  );
}
