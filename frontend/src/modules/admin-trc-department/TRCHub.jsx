import { Link } from "react-router-dom";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const cards = [
  {
    to: "/admin/trc/research",
    name: "Research",
    description: "Publish field research and findings for members to read.",
  },
  {
    to: "/admin/trc/training",
    name: "Training",
    description: "Schedule seminars and publish free courses.",
  },
  {
    to: "/admin/trc/consultancy",
    name: "Consultancy",
    description: "Publish one-on-one advisory offerings for members.",
  },
];

export default function TRCHub() {
  return (
    <AdminDashboardShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">TRC Department</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Research, Training & Consultancy — one department, three content types, all free to members.
        </p>
      </div>

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
    </AdminDashboardShell>
  );
}
