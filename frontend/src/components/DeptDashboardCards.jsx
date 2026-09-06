import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

// Shared "quick summary of activity" card grid for a department's own
// Dashboard tab — same visual pattern as AdminHub's welcome cards and
// admin-maintenance-department/DashboardPanel.jsx (2026-09-05 spec: every
// department dashboard should show this, not just static welcome text).
//
// `endpoint` is the department's own GET /.../dashboard route. `buildCards`
// maps that endpoint's JSON body to a list of { label, value, hint?, nav? }
// cards. `onNavigate` (optional) lets a card double as a shortcut into the
// tab named by its `nav` key, same as DashboardPanel.jsx's existing pattern.
export default function DeptDashboardCards({ endpoint, buildCards, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(endpoint)
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-canopy-100">Loading…</p>;

  const cards = buildCards(data);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const Tag = c.nav && onNavigate ? "button" : "div";
        return (
          <Tag
            key={c.label}
            type={Tag === "button" ? "button" : undefined}
            onClick={Tag === "button" ? () => onNavigate(c.nav) : undefined}
            className={`card flex flex-col items-start gap-1 text-left ${
              Tag === "button" ? "transition hover:border-canopy-400 hover:shadow-md" : ""
            }`}
          >
            <p className="text-sm text-ink-600">{c.label}</p>
            <p className="text-2xl font-medium text-ink-900">{c.value}</p>
            {c.hint && <p className="text-xs text-ink-600">{c.hint}</p>}
          </Tag>
        );
      })}
    </div>
  );
}
