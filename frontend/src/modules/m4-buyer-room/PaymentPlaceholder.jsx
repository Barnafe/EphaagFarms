import { useState } from "react";
import { CreditCard } from "lucide-react";

// Placeholder payment step — no real payment gateway is wired in yet
// (that's coming later; this exists so checkout can be finished end to
// end in the meantime). Confirming here still places the real order
// through the backend, same as before — only the "how you pay" surface
// is a stand-in.
export default function PaymentPlaceholder({ total, onConfirm, onBack, submitting }) {
  const [method, setMethod] = useState("transfer");

  return (
    <div className="rounded-card border border-soil-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Payment</p>
        <button type="button" onClick={onBack} className="text-sm text-canopy-800">
          ← Back
        </button>
      </div>

      <div className="rounded-card border border-dashed border-gray-300 bg-soil-50 px-4 py-3 text-sm text-gray-600">
        A real payment gateway isn't connected yet — this is a placeholder so checkout can be
        completed while that's being wired up. No card or transfer details are actually processed
        here.
      </div>

      <div className="space-y-2">
        {[
          { id: "transfer", label: "Bank transfer" },
          { id: "card", label: "Card payment" },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMethod(opt.id)}
            className={`flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left text-sm transition ${
              method === opt.id
                ? "border-canopy-600 bg-canopy-50 text-canopy-800"
                : "border-gray-200 text-gray-700 hover:border-canopy-400"
            }`}
          >
            <CreditCard className="h-4 w-4" />
            {opt.label} <span className="text-xs text-gray-400">(placeholder)</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-card bg-soil-50 px-3 py-2.5 text-sm">
        <span className="text-gray-600">Amount due</span>
        <span className="font-semibold text-gray-900">₦{total.toLocaleString()}</span>
      </div>

      <button className="btn-primary w-full" type="button" onClick={onConfirm} disabled={submitting}>
        {submitting ? "Placing order..." : "Confirm & place order"}
      </button>
    </div>
  );
}
