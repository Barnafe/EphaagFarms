import { useState } from "react";
import { STATUS_LABEL } from "./PurchaseRequestList.jsx";

function Field({ label, children }) {
  return (
    <label className="block text-xs text-ink-600">
      {label}
      {children}
    </label>
  );
}

function ActionButton({ children, ...props }) {
  return (
    <button className="btn-primary" type="submit" {...props}>
      {children}
    </button>
  );
}

// A note+submit mini-form shared by the simple one-field actions
// (approve/reject/cancel/mark-delivered/verify-invoice).
function NoteAction({ label, buttonLabel, onSubmit, tone = "primary" }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(note);
      setNote("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label={label}>
        <textarea
          className="mt-1 w-full rounded-card border border-soil-200 px-2 py-1.5 text-sm"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <button className={tone === "danger" ? "btn-outline" : "btn-primary"} type="submit" disabled={busy}>
        {busy ? "Working…" : buttonLabel}
      </button>
    </form>
  );
}

export default function PurchaseRequestDetail({ request, suppliers, actions }) {
  const [quoteForm, setQuoteForm] = useState({ supplierId: "", amount: "", validUntil: "", notes: "" });
  const [poItems, setPoItems] = useState(null); // lazily seeded from request.items
  const [paymentForm, setPaymentForm] = useState({ amount: "", reference: "", notes: "" });
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", amount: "", notes: "" });
  const [busy, setBusy] = useState(false);

  if (!request) return <div className="card text-sm text-ink-600">Select a purchase request.</div>;

  const items = poItems || request.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unit: it.unit || "",
    unitPrice: it.estimated_unit_price || "",
  }));

  async function submitQuotation(e) {
    e.preventDefault();
    if (!quoteForm.supplierId || !quoteForm.amount) return;
    setBusy(true);
    try {
      await actions.addQuotation(request.id, {
        supplierId: quoteForm.supplierId,
        amount: Number(quoteForm.amount),
        validUntil: quoteForm.validUntil || undefined,
        notes: quoteForm.notes || undefined,
      });
      setQuoteForm({ supplierId: "", amount: "", validUntil: "", notes: "" });
    } finally {
      setBusy(false);
    }
  }

  async function submitPO(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await actions.createPurchaseOrder(
        request.id,
        items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit: it.unit || undefined,
          unitPrice: Number(it.unitPrice),
        }))
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(e, type) {
    e.preventDefault();
    setBusy(true);
    try {
      const fn = type === "initial" ? actions.authorizePayment : actions.finalPayment;
      await fn(request.id, {
        amount: Number(paymentForm.amount),
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });
      setPaymentForm({ amount: "", reference: "", notes: "" });
    } finally {
      setBusy(false);
    }
  }

  async function submitInvoice(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await actions.recordInvoice(request.id, {
        invoiceNumber: invoiceForm.invoiceNumber || undefined,
        amount: Number(invoiceForm.amount),
        notes: invoiceForm.notes || undefined,
      });
      setInvoiceForm({ invoiceNumber: "", amount: "", notes: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-canopy-800">{request.reference}</p>
            <h2 className="text-lg font-medium text-ink-900">{request.title}</h2>
          </div>
          <span className="rounded-full bg-soil-100 px-3 py-1 text-xs text-ink-600">
            {STATUS_LABEL[request.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-600">
          {request.department} · raised by {request.requester_name}
          {request.needed_by ? ` · needed by ${request.needed_by}` : ""}
        </p>
        {request.justification && <p className="mt-2 text-sm text-ink-900">{request.justification}</p>}

        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-ink-600">Items requested</p>
          {request.items.map((it) => (
            <p key={it.id} className="text-sm text-ink-900">
              {it.quantity} {it.unit || ""} — {it.description}
              {it.estimated_unit_price ? ` (est. ₦${Number(it.estimated_unit_price).toLocaleString()}/unit)` : ""}
            </p>
          ))}
        </div>
      </div>

      {/* Stage 2: need verification */}
      {request.status === "pending_approval" && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-900">Verify need — approve</p>
            <NoteAction
              label="Approval note (optional)"
              buttonLabel="Approve request"
              onSubmit={(note) => actions.approve(request.id, note)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-900">Or reject</p>
            <NoteAction
              label="Rejection reason"
              buttonLabel="Reject request"
              tone="danger"
              onSubmit={(note) => actions.reject(request.id, note)}
            />
          </div>
        </div>
      )}

      {/* Stage 3/4/5: RFQ, quotation comparison, supplier selection, PO */}
      {(request.status === "approved" || request.status === "sourcing") && (
        <div className="card space-y-4">
          <div>
            <p className="text-sm font-medium text-ink-900">Record a supplier quotation</p>
            <form onSubmit={submitQuotation} className="mt-2 grid gap-2 sm:grid-cols-4">
              <select
                className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                value={quoteForm.supplierId}
                onChange={(e) => setQuoteForm((f) => ({ ...f, supplierId: e.target.value }))}
              >
                <option value="">Supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                placeholder="Quoted amount ₦"
                className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                value={quoteForm.amount}
                onChange={(e) => setQuoteForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <input
                type="date"
                className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                value={quoteForm.validUntil}
                onChange={(e) => setQuoteForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
              <ActionButton disabled={busy}>Add quotation</ActionButton>
            </form>
          </div>

          {request.quotations.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink-900">Quotation comparison</p>
              <div className="mt-2 space-y-2">
                {request.quotations.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-ink-900">
                        {q.supplier_name} — ₦{Number(q.amount).toLocaleString()}
                      </p>
                      <p className="text-xs text-ink-600">
                        {q.status}
                        {q.valid_until ? ` · valid until ${q.valid_until}` : ""}
                        {q.notes ? ` · ${q.notes}` : ""}
                      </p>
                    </div>
                    {request.status === "sourcing" && q.status === "received" && (
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await actions.selectSupplier(request.id, q.id);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Select supplier
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.selected_supplier_id && (
            <div>
              <p className="text-sm font-medium text-ink-900">Raise purchase order</p>
              <p className="text-xs text-ink-600">Confirm line items and unit prices agreed with the selected supplier.</p>
              <form onSubmit={submitPO} className="mt-2 space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <input
                      className="col-span-5 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                      value={it.description}
                      onChange={(e) =>
                        setPoItems(items.map((row, idx) => (idx === i ? { ...row, description: e.target.value } : row)))
                      }
                    />
                    <input
                      type="number"
                      className="col-span-2 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                      value={it.quantity}
                      onChange={(e) =>
                        setPoItems(items.map((row, idx) => (idx === i ? { ...row, quantity: e.target.value } : row)))
                      }
                    />
                    <input
                      className="col-span-2 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                      placeholder="Unit"
                      value={it.unit}
                      onChange={(e) =>
                        setPoItems(items.map((row, idx) => (idx === i ? { ...row, unit: e.target.value } : row)))
                      }
                    />
                    <input
                      type="number"
                      className="col-span-3 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
                      placeholder="Agreed unit price ₦"
                      value={it.unitPrice}
                      onChange={(e) =>
                        setPoItems(items.map((row, idx) => (idx === i ? { ...row, unitPrice: e.target.value } : row)))
                      }
                    />
                  </div>
                ))}
                <ActionButton disabled={busy}>Raise purchase order</ActionButton>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Stage 6: PO approval */}
      {request.status === "po_pending_approval" && request.purchaseOrder && (
        <div className="card space-y-3">
          <p className="text-sm font-medium text-ink-900">
            Purchase order {request.purchaseOrder.po_reference} — ₦{Number(request.purchaseOrder.total_amount).toLocaleString()}
          </p>
          <div className="space-y-1">
            {request.purchaseOrder.items.map((it, i) => (
              <p key={i} className="text-sm text-ink-900">
                {it.quantity} {it.unit || ""} {it.description} — ₦{Number(it.unitPrice).toLocaleString()}/unit = ₦
                {Number(it.lineTotal).toLocaleString()}
              </p>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NoteAction
              label="Approval note (optional)"
              buttonLabel="Approve purchase order"
              onSubmit={(note) => actions.decidePO(request.purchaseOrder.id, "approve", note)}
            />
            <NoteAction
              label="Rejection reason"
              buttonLabel="Reject purchase order"
              tone="danger"
              onSubmit={(note) => actions.decidePO(request.purchaseOrder.id, "reject", note)}
            />
          </div>
        </div>
      )}

      {/* Stage 7: Finance — initial payment / financial authorization */}
      {request.status === "po_approved" && (
        <div className="card">
          <p className="text-sm font-medium text-ink-900">Finance: payment / financial authorization</p>
          <p className="text-xs text-ink-600">Is it within budget and financially authorized?</p>
          <form onSubmit={(e) => submitPayment(e, "initial")} className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              type="number"
              min="0"
              placeholder="Amount ₦"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input
              placeholder="Payment reference"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
            />
            <ActionButton disabled={busy}>Authorize & pay</ActionButton>
          </form>
        </div>
      )}

      {/* Stage 8: supplier delivery */}
      {request.status === "awaiting_delivery" && (
        <div className="card">
          <p className="text-sm font-medium text-ink-900">Supplier: awaiting delivery</p>
          <NoteAction
            label="Delivery note (optional)"
            buttonLabel="Mark as delivered"
            onSubmit={(note) => actions.markDelivered(request.id, note)}
          />
        </div>
      )}

      {/* Stage 8b: goods/service verification */}
      {request.status === "delivered" && (
        <div className="card space-y-2">
          <p className="text-sm font-medium text-ink-900">Goods / service verification</p>
          {["correct", "wrong", "damaged", "incomplete"].map((result) => (
            <VerifyGoodsRow key={result} result={result} onSubmit={(note) => actions.verifyGoods(request.id, result, note)} />
          ))}
        </div>
      )}

      {/* Return / Dispute branch */}
      {request.status === "goods_disputed" && (
        <div className="card space-y-3">
          <p className="text-sm font-medium text-ink-900">Dispute: {request.dispute_reason}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <NoteAction
              label="Redelivery note"
              buttonLabel="Supplier will redeliver"
              onSubmit={(note) => actions.resolveDispute(request.id, "redeliver", note)}
            />
            <NoteAction
              label="Cancellation note"
              buttonLabel="Cancel request instead"
              tone="danger"
              onSubmit={(note) => actions.resolveDispute(request.id, "cancel", note)}
            />
          </div>
        </div>
      )}

      {/* Goods received -> Invoice verification */}
      {request.status === "goods_received" && (
        <div className="card">
          <p className="text-sm font-medium text-ink-900">Record supplier invoice</p>
          <form onSubmit={submitInvoice} className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Invoice number"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={invoiceForm.invoiceNumber}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
            />
            <input
              type="number"
              min="0"
              placeholder="Invoice amount ₦"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={invoiceForm.amount}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <ActionButton disabled={busy}>Record invoice</ActionButton>
          </form>
        </div>
      )}

      {request.status === "invoice_verification" && request.invoice && (
        <div className="card space-y-2">
          <p className="text-sm font-medium text-ink-900">
            Invoice {request.invoice.invoice_number || "(no number)"} — ₦{Number(request.invoice.amount).toLocaleString()}
          </p>
          <NoteAction
            label="Verification note (optional)"
            buttonLabel="Verify invoice"
            onSubmit={(note) => actions.verifyInvoice(request.id, note)}
          />
        </div>
      )}

      {/* Final payment */}
      {request.status === "final_payment_pending" && (
        <div className="card">
          <p className="text-sm font-medium text-ink-900">Finance: final payment</p>
          <form onSubmit={(e) => submitPayment(e, "final")} className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              type="number"
              min="0"
              placeholder="Amount ₦"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input
              placeholder="Payment reference"
              className="rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
            />
            <ActionButton disabled={busy}>Record final payment</ActionButton>
          </form>
        </div>
      )}

      {["pending_approval", "approved", "sourcing", "po_pending_approval"].includes(request.status) && (
        <div className="card">
          <NoteAction
            label="Cancellation reason"
            buttonLabel="Cancel this request"
            tone="danger"
            onSubmit={(note) => actions.cancel(request.id, note)}
          />
        </div>
      )}

      {/* Audit trail — always visible */}
      <div className="card">
        <p className="text-sm font-medium text-ink-900">Audit trail</p>
        <div className="mt-2 space-y-2">
          {request.history.map((h) => (
            <div key={h.id} className="text-xs text-ink-600">
              <span className="text-ink-900">{h.actor_name || "System"}</span>{" "}
              {h.from_status ? `moved ${h.from_status} → ${h.to_status}` : `created (${h.to_status})`}
              {h.note ? ` — ${h.note}` : ""} · {new Date(h.created_at).toLocaleString()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerifyGoodsRow({ result, onSubmit }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = {
    correct: "✅ Correct — accept goods",
    wrong: "❌ Wrong item",
    damaged: "❌ Damaged",
    incomplete: "❌ Incomplete",
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={result === "correct" ? "btn-primary" : "btn-outline"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(note);
          } finally {
            setBusy(false);
          }
        }}
      >
        {labels[result]}
      </button>
      {result !== "correct" && (
        <input
          className="flex-1 rounded-card border border-soil-200 px-2 py-1 text-sm"
          placeholder="Note (what's wrong)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
    </div>
  );
}
