import { Link } from "react-router-dom";

export default function RoomBackLink({ to, label }) {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-8">
      <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-canopy-800 hover:text-clay-600">
        ← {label}
      </Link>
    </div>
  );
}
