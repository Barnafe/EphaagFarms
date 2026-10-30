import { Link } from "react-router-dom";

export default function PayoutsNotice({ text }) {
  return (
    <div className="card space-y-2">
      <p className="text-sm text-ink-900">{text}</p>
      <Link to="/admin/payouts" className="btn-primary inline-block">Open Payouts</Link>
    </div>
  );
}
