import { ArrowLeft } from "lucide-react";

// Card-grid section switcher for admin department pages — same pattern as
// the TRC Department hub (click a card to open it, one section at a time)
// instead of a permanently-visible wall of pill tabs stacked above a pile
// of tables. `sections`: [{ key, label, description?, icon?: LucideComponent }]
// `activeKey`: null/undefined shows the card grid; a key shows that
// section's back-link. Parent still owns which section's content renders.
export default function DeptSectionNav({ sections, activeKey, onSelect, deptLabel = "sections" }) {
  if (!activeKey) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              className="card flex flex-col items-start gap-2 text-left transition hover:border-canopy-400 hover:shadow-md"
            >
              {Icon && (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-canopy-50 text-canopy-700">
                  <Icon size={20} />
                </span>
              )}
              <p className="font-medium text-ink-900">{s.label}</p>
              {s.description && <p className="text-sm text-ink-600">{s.description}</p>}
              {s.badge != null && s.badge > 0 && (
                <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium text-clay-700">
                  {s.badge} pending
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const active = sections.find((s) => s.key === activeKey);

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-canopy-300 hover:text-white"
      >
        <ArrowLeft size={14} /> All {deptLabel}
      </button>
      {active && <span className="text-sm font-medium text-white">{active.label}</span>}
    </div>
  );
}
