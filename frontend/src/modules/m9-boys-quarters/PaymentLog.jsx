import { useState } from "react";

const statusStyles = {
  due: "bg-soil-100 text-ink-600",
  on_time: "bg-canopy-50 text-canopy-800",
  late: "bg-harvest-50 text-harvest-600",
  missed: "bg-red-50 text-red-700",
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export default function PaymentLog({ application, payments, onLogPayment }) {
  const [amount, setAmount] = useState(String(application.amount));

  if (application.planType !== "monthly") return null;

  const paidPayments = payments.filter((p) => p.date);
  const days = daysUntil(application.nextDueDate);

  function handleLog(e) {
    e.preventDefault();
    if (!amount) return;
    onLogPayment({ amount: Number(amount) });
  }

  return (
    <div className="card">
      {application.nextDueDate && (
        <div className="mb-4 rounded-card bg-soil-50 px-4 py-3">
          <p className="text-sm text-ink-600">Next payment due</p>
          <p className="mt-0.5 text-lg font-medium text-ink-900">
            {application.nextDueDate}
            {days !== null && (
              <span className="ml-2 text-sm font-normal text-ink-600">
                {days > 0 ? `— ${days} day${days === 1 ? "" : "s"} away` : days === 0 ? "— due today" : `— ${Math.abs(days)} day(s) overdue`}
              </span>
            )}
          </p>
        </div>
      )}

      <p className="text-sm text-ink-600">Payment history</p>
      <div className="mt-2 space-y-1">
        {paidPayments.length === 0 && <p className="text-sm text-ink-600">No payments logged yet.</p>}
        {paidPayments.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span className="text-ink-600">{p.date}</span>
            <span className="text-ink-900">₦{p.amount.toLocaleString()}</span>
            <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[p.status]}`}>
              {p.status.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>

      {application.paymentMode === "manual" && (
        <form onSubmit={handleLog} className="field mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label>Log this month's payment (₦)</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">
            Log payment
          </button>
        </form>
      )}
      {application.paymentMode === "auto" && (
        <p className="mt-3 text-xs text-ink-600">Auto-charged monthly — no manual logging needed.</p>
      )}
    </div>
  );
}
