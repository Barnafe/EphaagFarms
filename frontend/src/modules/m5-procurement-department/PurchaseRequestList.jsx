export const STATUS_LABEL = {
  pending_approval: "Awaiting need verification",
  rejected: "Rejected",
  approved: "Approved — awaiting sourcing",
  sourcing: "Sourcing / RFQ",
  po_pending_approval: "PO awaiting approval",
  po_approved: "PO approved — awaiting payment",
  awaiting_delivery: "Awaiting delivery",
  delivered: "Delivered — verify goods",
  goods_disputed: "Disputed — return/issue",
  goods_received: "Goods received — awaiting invoice",
  invoice_verification: "Invoice awaiting verification",
  final_payment_pending: "Awaiting final payment",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE = {
  pending_approval: "bg-harvest-50 text-harvest-600",
  rejected: "bg-clay-50 text-clay-700",
  approved: "bg-soil-100 text-ink-600",
  sourcing: "bg-harvest-50 text-harvest-600",
  po_pending_approval: "bg-harvest-50 text-harvest-600",
  po_approved: "bg-soil-100 text-ink-600",
  awaiting_delivery: "bg-soil-100 text-ink-600",
  delivered: "bg-harvest-50 text-harvest-600",
  goods_disputed: "bg-clay-50 text-clay-700",
  goods_received: "bg-soil-100 text-ink-600",
  invoice_verification: "bg-harvest-50 text-harvest-600",
  final_payment_pending: "bg-harvest-50 text-harvest-600",
  completed: "bg-canopy-50 text-canopy-800",
  cancelled: "bg-clay-50 text-clay-700",
};

export default function PurchaseRequestList({ requests, selectedId, onSelect }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Purchase requests</p>
      <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
        {requests.length === 0 && <p className="text-sm text-ink-600">Nothing here yet.</p>}
        {requests.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            className={`block w-full rounded-card border px-3 py-2 text-left ${
              selectedId === r.id ? "border-canopy-600 bg-canopy-50" : "border-soil-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-canopy-800">{r.reference}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-900">{r.title}</p>
            <p className="text-xs text-ink-600">
              {r.department} · {r.requester_name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
