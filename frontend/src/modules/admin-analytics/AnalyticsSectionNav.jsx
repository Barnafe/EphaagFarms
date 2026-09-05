// Unlike the shared DeptSectionNav (big card grid -> click in -> back
// arrow), the Analytics room keeps every section as a small pill, always
// visible, pinned to the top of the scroll area via `sticky`. Scrolling
// down through one section's content carries this strip up with the page
// until it hits the top of the viewport, then it sticks there — so
// switching to another section (e.g. "Mark attendance") is always just a
// scroll-up-and-click away, no back button needed.
export default function AnalyticsSectionNav({ sections, activeKey, onSelect }) {
  const active = sections.find((s) => s.key === activeKey);
  return (
    <div className="sticky top-0 z-20 -mx-6 border-b border-white/10 bg-canopy-950/95 px-6 py-3 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = s.key === activeKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-clay-700 text-white"
                  : "bg-canopy-900 text-canopy-100 hover:bg-canopy-800 hover:text-white"
              }`}
            >
              {Icon && <Icon size={14} />}
              {s.label}
            </button>
          );
        })}
      </div>
      {active?.description && <p className="mt-1 text-xs text-canopy-100">{active.description}</p>}
    </div>
  );
}
