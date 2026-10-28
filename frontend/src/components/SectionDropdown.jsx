import { ChevronDown } from "lucide-react";

// The one pull-down "Jump to" list used across the app. Pass the sections
// and the active key; picking an option calls onSelect(key).
//
// sections: [{ key, label, badge? }]   badge = a pending count shown as "(3)"
// allKey:   optional extra first option (e.g. "Show all sections")
export default function SectionDropdown({
  sections,
  value,
  onSelect,
  label = "Jump to",
  allKey = null,
  allLabel = "Show all sections",
  placeholder = null,
  className = "",
}) {
  return (
    <label className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-canopy-300">{label}</span>
      <span className="relative inline-block min-w-[14rem] max-w-full">
        <select
          value={value ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none rounded-card border border-canopy-600 bg-canopy-900 py-2 pl-3 pr-9 text-sm font-medium text-white focus:border-clay-400 focus:outline-none"
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {allKey && <option value={allKey}>{allLabel}</option>}
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
              {s.badge ? ` (${s.badge})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-canopy-200"
        />
      </span>
    </label>
  );
}
