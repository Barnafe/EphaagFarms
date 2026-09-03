import { Link } from "react-router-dom";

// Reused for every level of card navigation across the service rooms —
// top-level departments already have their own grid on Home.jsx; this is
// for everything one or two levels deeper (a room's own sub-cards).

export default function ServiceCardGrid({ items, theme }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group relative overflow-hidden rounded-card border border-soil-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span
              className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
              style={{ background: `linear-gradient(90deg, ${theme.heroFrom}, ${theme.heroTo})` }}
            />
            {item.badge && (
              <div className={`mb-4 flex h-11 w-11 rotate-45 items-center justify-center rounded ${theme.badge}`}>
                <span className={`-rotate-45 text-lg font-semibold ${theme.badgeText}`}>{item.badge}</span>
              </div>
            )}
            <p className="font-display text-lg font-semibold text-ink-900">{item.title}</p>
            <p className="mt-2 text-sm text-ink-600">{item.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-canopy-800 group-hover:gap-2 transition-all">
              View details →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
