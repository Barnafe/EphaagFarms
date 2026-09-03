import { useEffect, useState } from "react";

// Placeholder slides — swap `videoSrc` for a real file once available and
// this will render an actual <video> instead of the placeholder panel.
const slides = [
  { id: 1, label: "Video 1 of 3", caption: "Farmers at work across Nigeria", videoSrc: null },
  { id: 2, label: "Video 2 of 3", caption: "Sourcing, processing, and delivery", videoSrc: null },
  { id: 3, label: "Video 3 of 3", caption: "Seminars and farmer training", videoSrc: null },
];

const ROTATE_MS = 5000;

export default function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative h-[260px] overflow-hidden bg-gradient-to-br from-canopy-900 via-canopy-800 to-canopy-900 sm:h-[320px]">
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #e0a232 1px, transparent 1px), linear-gradient(-45deg, #e0a232 1px, transparent 1px)",
          backgroundSize: "46px 46px",
        }}
      />

      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        >
          {slide.videoSrc ? (
            <video
              className="h-full w-full object-cover"
              src={slide.videoSrc}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            i === active && (
              <div className="flex flex-col items-center gap-1 text-canopy-100/70">
                <span className="text-xs font-medium">{slide.label}</span>
                <span className="text-sm text-white/90">{slide.caption}</span>
                <span className="text-[11px] text-canopy-100/50">placeholder — swap in the real video</span>
              </div>
            )
          )}
        </div>
      ))}

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Show ${slide.label}`}
            onClick={() => setActive(i)}
            className={`h-2 w-2 rounded-full ${i === active ? "bg-clay-400" : "bg-white/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
