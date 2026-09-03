import { useState } from "react";

// Admin-initiated: pay a farmer out of their insurance savings balance
// (distinct from the farmer-requested main/insurance withdrawal flow
// above, which shows up in "Withdrawal requests").
export default function InsuranceApplyControl({ farmer, onApply }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await onApply(farmer.userId, Number(amount), note);
      setOpen(false);
      setAmount("");
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-outline text-xs"
        disabled={farmer.insuranceTotal <= 0}
        onClick={() => setOpen(true)}
      >
        Apply insurance
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-card border border-soil-200 p-2">
      <p className="text-xs text-ink-600">
        Pays out of {farmer.farmerName}'s insurance balance (₦{farmer.insuranceTotal.toLocaleString()} available).
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          min="0"
          max={farmer.insuranceTotal}
          className="w-32 text-xs"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="flex-1 text-xs"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="btn-primary text-xs" disabled={saving} onClick={submit}>
          {saving ? "Applying…" : "Confirm"}
        </button>
        <button type="button" className="text-xs text-ink-600" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
