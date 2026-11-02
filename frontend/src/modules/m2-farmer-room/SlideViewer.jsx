import { useEffect, useRef, useState } from "react";

// A slide deck you scroll through. When the last slide comes into view (after
// starting at the first), the deck counts as finished and onFinished is called once.
export default function SlideViewer({ slides, onFinished }) {
  const box = useRef(null);
  const seen = useRef(new Set());
  const finished = useRef(false);
  const callback = useRef(onFinished);
  callback.current = onFinished;
  const [reached, setReached] = useState(1);

  useEffect(() => {
    const root = box.current;
    if (!root || !slides.length) return undefined;
    const last = slides.length - 1;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number(e.target.dataset.index);
          seen.current.add(i);
          setReached((r) => Math.max(r, i + 1));
        }
        if (!finished.current && seen.current.has(last) && seen.current.has(0)) {
          finished.current = true;
          callback.current?.();
        }
      },
      { root, threshold: 0.5 }
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [slides]);

  return (
    <div className="relative">
      <div ref={box} className="max-h-[70vh] space-y-3 overflow-y-auto rounded-card bg-gray-100 p-2" tabIndex={0} aria-label="Slides">
        {slides.map((src, i) => (
          <div key={src + i} data-index={i} className="min-h-[120px]">
            <img src={src} alt={`Slide ${i + 1}`} loading="lazy" className="w-full rounded bg-white" />
          </div>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
        Slide {Math.min(reached, slides.length)} of {slides.length}
      </p>
    </div>
  );
}
