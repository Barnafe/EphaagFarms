import { useCallback, useEffect, useRef, useState } from "react";

const slides = [
  { id: 1, label: "Video 1 of 3", videoSrc: "/videos/intro-slideshow.mp4", poster: "/videos/intro-poster.jpg" },
  { id: 2, label: "Video 2 of 3", videoSrc: "/videos/crops-slideshow.mp4", poster: "/videos/crops-poster.jpg" },
  { id: 3, label: "Video 3 of 3", videoSrc: "/videos/poultry-slideshow.mp4", poster: "/videos/poultry-poster.jpg" },
];

const SHOW_MS = 8000; // how long each video plays before the next one slides in
const FADE_MS = 700;
const WAIT_MS = 4000; // longest we wait for the next video to be ready

// Never blank: every slide shows its poster picture at once, the next slide fades in
// on top of the current one (the current one stays underneath until the fade ends),
// and the show only moves on when the next video is ready to play.
export default function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState(null);
  const videos = useRef([]);
  const reduced = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  const goTo = useCallback((i) => {
    setActive((cur) => {
      if (cur === i) return cur;
      setPrev(cur);
      return i;
    });
  }, []);

  // Play the visible video from the start; pause the one that just faded out.
  useEffect(() => {
    const v = videos.current[active];
    if (v && !reduced.current) {
      try { v.currentTime = 0; } catch { /* not seekable yet */ }
      v.play?.().catch(() => {});
    }
    if (prev === null) return undefined;
    const t = setTimeout(() => {
      const p = videos.current[prev];
      if (p && prev !== active) p.pause();
      setPrev(null);
    }, FADE_MS + 100);
    return () => clearTimeout(t);
  }, [active, prev]);

  // Move on after SHOW_MS, but only once the next video can play (or after WAIT_MS).
  useEffect(() => {
    if (reduced.current) return undefined;
    const next = (active + 1) % slides.length;
    let cancelled = false;
    let waitTimer;
    const nextVideo = () => videos.current[next];
    const timer = setTimeout(() => {
      const v = nextVideo();
      if (!v || v.readyState >= 3) { goTo(next); return; }
      const go = () => { if (!cancelled) { clearTimeout(waitTimer); v.removeEventListener("canplay", go); goTo(next); } };
      v.addEventListener("canplay", go);
      waitTimer = setTimeout(go, WAIT_MS);
    }, SHOW_MS);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(waitTimer); };
  }, [active, goTo]);

  // Stop the video while the tab is hidden.
  useEffect(() => {
    function onVisibility() {
      const v = videos.current[active];
      if (!v || reduced.current) return;
      if (document.hidden) v.pause(); else v.play?.().catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  const next = (active + 1) % slides.length;

  return (
    <div className="relative h-[260px] overflow-hidden bg-canopy-900 sm:h-[320px]">
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity ease-in-out ${
            i === active ? "z-20 opacity-100" : i === prev ? "z-10 opacity-100" : "z-0 opacity-0"
          }`}
          style={{ transitionDuration: `${FADE_MS}ms`, backgroundImage: `url(${slide.poster})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <video
            ref={(el) => { videos.current[i] = el; }}
            className="h-full w-full object-cover"
            src={slide.videoSrc}
            poster={slide.poster}
            autoPlay={i === 0 && !reduced.current}
            muted
            loop
            playsInline
            preload={i === active || i === next ? "auto" : "metadata"}
          />
        </div>
      ))}

      <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Show ${slide.label}`}
            onClick={() => goTo(i)}
            className={`h-2 w-2 rounded-full ${i === active ? "bg-clay-400" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
