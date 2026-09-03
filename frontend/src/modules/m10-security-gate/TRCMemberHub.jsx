import { Link } from "react-router-dom";
import MyEducationSummary from "./MyEducationSummary.jsx";
import { myEducation } from "./mockData.js";

const cards = [
  {
    to: "/dashboard/farmer/education/research",
    name: "Research",
    description: "Read the latest field research and findings.",
  },
  {
    to: "/dashboard/farmer/education/training",
    name: "Training",
    description: "Upcoming seminars and free courses. Unit Leaders record attendance here.",
  },
  {
    to: "/dashboard/farmer/education/consultancy",
    name: "Consultancy",
    description: "One-on-one advisory offerings from EPHAAG Farms.",
  },
];

export default function TRCMemberHub() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-600">Module 10</p>
        <h1 className="text-xl font-medium text-ink-900">Research, Training & Consultancy</h1>
        <p className="mt-1 text-sm text-ink-600">Always free to members.</p>
      </div>

      <MyEducationSummary education={myEducation} />

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="card block transition hover:border-canopy-400 hover:shadow-sm"
          >
            <p className="font-medium text-ink-900">{c.name}</p>
            <p className="mt-1 text-sm text-ink-600">{c.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
