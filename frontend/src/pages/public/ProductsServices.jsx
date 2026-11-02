import { Link } from "react-router-dom";
import { services } from "../../data/services.js";

export default function ProductsServices() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-medium text-ink-900">Products & Services</h1>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {services.map((s) => (
          <Link key={s.title} to={s.to} className="card group flex items-start gap-4 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className={`flex h-10 w-10 shrink-0 rotate-45 items-center justify-center rounded ${s.color}`}>
              <span className="-rotate-45 text-base font-semibold text-white">{s.icon}</span>
            </div>
            <div>
              <p className="font-medium text-ink-900">{s.title}</p>
              <p className="mt-1 text-sm text-ink-600">{s.desc}</p>
              <span className="mt-2 inline-block text-sm font-medium text-canopy-800">View →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
