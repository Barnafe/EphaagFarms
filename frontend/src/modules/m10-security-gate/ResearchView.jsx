import { Link } from "react-router-dom";
import { research } from "./mockData.js";

export default function ResearchView() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <Link to="/dashboard/farmer/education" className="text-xs text-canopy-600 hover:underline">
          ← Research, Training & Consultancy
        </Link>
        <h1 className="mt-1 text-xl font-medium text-ink-900">Research</h1>
      </div>

      <div className="card">
        <div className="space-y-2">
          {research.map((r) => (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="font-medium text-ink-900">{r.title}</p>
              <p className="text-sm text-ink-600">{r.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
