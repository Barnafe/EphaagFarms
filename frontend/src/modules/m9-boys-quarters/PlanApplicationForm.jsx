import { useState } from "react";
import { roiSchedule } from "./mockData.js";

export default function PlanApplicationForm({ onSubmit }) {
  const [planType, setPlanType] = useState("monthly");
  const [amount, setAmount] = useState("");
  const [durationYears, setDurationYears] = useState(5);
  const [paymentMode, setPaymentMode] = useState("auto");
  const [agreed, setAgreed] = useState(false);

  const minAmount = planType === "monthly" ? 5000 : 100000;
  const schedule = roiSchedule[planType];

  function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) < minAmount || !agreed) return;
    onSubmit({ planType, amount: Number(amount), durationYears, paymentMode });
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-3">
      <p className="text-sm text-ink-600">Choose an investment plan</p>

      <div>
        <label>Plan type</label>
        <select value={planType} onChange={(e) => setPlanType(e.target.value)}>
          <option value="monthly">Monthly — ₦5,000 and above</option>
          <option value="bulk">Bulk (one-time payment) — ₦100,000 and above</option>
        </select>
      </div>

      <div className="rounded-card bg-soil-50 px-3 py-2 text-xs text-ink-600">
        ROI by year: {schedule.map((p, i) => `Yr${i + 1} ${p}%`).join(" · ")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>{planType === "monthly" ? "Monthly amount (₦)" : "Total amount (₦)"}</label>
          <input
            type="number"
            min={minAmount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${minAmount.toLocaleString()}+`}
          />
        </div>
        <div>
          <label>Duration</label>
          <select value={durationYears} onChange={(e) => setDurationYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} year{y > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {planType === "monthly" && (
        <div>
          <label>Payment method</label>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            <option value="auto">Auto-charge monthly</option>
            <option value="manual">I'll pay manually each month</option>
          </select>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-ink-600">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I've read and agree to the investment terms.
      </label>

      <button className="btn-primary" type="submit" disabled={!agreed}>
        Submit application
      </button>
      <p className="text-xs text-ink-600">
        This is a proposal — Finance Department reviews it, then a physical agreement is signed
        before your investment goes active.
      </p>
    </form>
  );
}
