import { useState } from "react";
import SectionDropdown from "./SectionDropdown.jsx";

// Replaces a long vertical pile of panels with a pull-down list. Only the
// chosen section is shown, so nobody scrolls past five tables to reach the
// sixth. "Show all sections" restores the old full stack for anyone who
// prefers it.
//
// sections: [{ key, label, badge?, node, hidden? }]
//   node   = the panel(s) to render for that section
//   hidden = true drops it (role-gated panels such as Unit Leader only)
// A single visible section renders with no dropdown at all.
export default function SectionStack({ sections, label = "Jump to", className = "space-y-6" }) {
  const visible = sections.filter((s) => !s.hidden);
  const [picked, setPicked] = useState(visible[0]?.key ?? null);

  if (visible.length === 0) return null;
  if (visible.length === 1) return <div className={className}>{visible[0].node}</div>;

  // If the picked section disappeared (role change, data reload), fall back
  // to the first one instead of rendering nothing.
  const active = picked === "__all__" || visible.some((s) => s.key === picked) ? picked : visible[0].key;
  const shown = active === "__all__" ? visible : visible.filter((s) => s.key === active);

  return (
    <div className={className}>
      <SectionDropdown
        sections={visible}
        value={active}
        onSelect={setPicked}
        label={label}
        allKey="__all__"
      />
      {shown.map((s) => (
        <div key={s.key} className="space-y-6">
          {s.node}
        </div>
      ))}
    </div>
  );
}
