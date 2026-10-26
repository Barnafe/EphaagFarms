const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// Shown at checkout when the buyer already ordered exactly the same items for the
// same amount. They decide: leave it alone, pay the existing unpaid order, or go
// ahead and pay again on purpose.
export default function DuplicateOrderNotice({ duplicate, kind, onProceed, onPayExisting, onCancel, busy }) {
  const paid = kind === "paid";
  return (
    <div className="on-light space-y-4 rounded-card border border-harvest-300 bg-harvest-50 p-5" role="alert">
      <div>
        <p className="text-base font-medium text-gray-900">{paid ? "You have already paid for this" : "You already have this order waiting for payment"}</p>
        <p className="mt-1 text-sm text-gray-700">
          {paid
            ? `Order ${duplicate.reference} for ${naira(duplicate.total)} was paid ${duplicate.paidAt ? "on " + new Date(duplicate.paidAt).toLocaleString() : "recently"} and is already being processed. If you ordered the same items again by mistake, you do not need to pay again.`
            : `Order ${duplicate.reference} for ${naira(duplicate.total)} has the same items and is still unpaid. You can pay for that one instead of creating a second order.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-card border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800" onClick={onCancel} disabled={busy}>
          {paid ? "No, I don't need to pay again" : "Back to my cart"}
        </button>
        {!paid && duplicate.canPay && (
          <button type="button" className="btn-primary" onClick={onPayExisting} disabled={busy}>Pay for the existing order</button>
        )}
        <button type="button" className="rounded-card border border-harvest-600 px-3 py-2 text-sm font-medium text-harvest-600" onClick={onProceed} disabled={busy}>
          {busy ? "Please wait…" : "Proceed to pay again"}
        </button>
      </div>
    </div>
  );
}
