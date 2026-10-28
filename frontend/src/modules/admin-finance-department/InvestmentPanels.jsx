import { useState } from "react";

function OfflineRecord({ application, onRecordOffline }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!open) return <button className="btn-outline mt-2 text-xs" type="button" onClick={() => setOpen(true)}>Record a payment received outside Paystack…</button>;
  async function submit() {
    if (reason.trim().length < 5) { setErr("Please write the reason (for example the bank transfer details)."); return; }
    setBusy(true); setErr(null);
    try { await onRecordOffline(application.id, reason.trim()); setOpen(false); setReason(""); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-2 space-y-2 rounded-card border border-soil-200 bg-soil-50 p-3">
      <p className="text-xs text-ink-700">Exception only. Records ₦{application.amount.toLocaleString()} as paid with no processing fee. It is flagged for review and every admin is told.</p>
      <textarea className="w-full rounded-card border border-soil-200 px-2 py-1 text-sm" rows={2} placeholder="Reason (required), e.g. Bank transfer TRF-123" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" type="button" disabled={busy} onClick={submit}>{busy ? "Recording…" : "Record payment"}</button>
        <button className="btn-outline" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function ApplicationReviewPanel({ applications, onDecide, onDownloadAgreement, onRecordOffline }) {
  const awaitingPayment = applications.filter((a) => a.status === "awaiting_payment");
  const activeMonthly = applications.filter((a) => a.status === "active");
  const submitted = applications.filter((a) => a.status === "submitted");
  const awaitingUpload = applications.filter((a) => a.status === "agreement_pending");
  const awaitingFinalReview = applications.filter((a) => a.status === "agreement_review");

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Investment applications</p>
      <div className="mt-3 space-y-2">
        {submitted.length === 0 && (
          <p className="text-sm text-ink-600">Nothing awaiting first review.</p>
        )}
        {submitted.map((a) => (
          <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
            <p className="text-xs font-medium text-canopy-800">{a.reference}</p>
            <p className="text-sm text-ink-900">{a.investorName}</p>
            <p className="text-xs text-ink-600">
              {a.planType === "monthly" ? "Monthly" : "Bulk"} · ₦{a.amount.toLocaleString()}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-primary"
                type="button"
                onClick={() => onDecide(a.id, "agreement_pending")}
              >
                Approve — email agreement to investor
              </button>
              <button className="btn-outline" type="button" onClick={() => onDecide(a.id, "rejected")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {awaitingUpload.length > 0 && (
        <div className="mt-5 border-t border-soil-200 pt-3">
          <p className="text-sm text-ink-600">Agreement emailed — waiting on investor's signed upload</p>
          <div className="mt-3 space-y-2">
            {awaitingUpload.map((a) => (
              <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
                <p className="text-xs font-medium text-canopy-800">{a.reference}</p>
                <p className="text-sm text-ink-900">{a.investorName}</p>
                <p className="text-xs text-ink-600">
                  {a.planType === "monthly" ? "Monthly" : "Bulk"} · ₦{a.amount.toLocaleString()}
                </p>
                <button className="btn-outline mt-2" type="button" onClick={() => onDecide(a.id, "rejected")}>
                  Cancel application
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {awaitingFinalReview.length > 0 && (
        <div className="mt-5 border-t border-soil-200 pt-3">
          <p className="text-sm text-ink-600">Signed agreement received — final review</p>
          <div className="mt-3 space-y-2">
            {awaitingFinalReview.map((a) => (
              <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
                <p className="text-xs font-medium text-canopy-800">{a.reference}</p>
                <p className="text-sm text-ink-900">{a.investorName}</p>
                <p className="text-xs text-ink-600">
                  {a.planType === "monthly" ? "Monthly" : "Bulk"} · ₦{a.amount.toLocaleString()}
                </p>
                <div className="mt-2 flex gap-2">
                  <button className="btn-outline" type="button" onClick={() => onDownloadAgreement(a)}>
                    Download signed agreement
                  </button>
                  <button className="btn-primary" type="button" onClick={() => onDecide(a.id, "active")}>
                    Approve — ask investor to pay
                  </button>
                  <button className="btn-outline" type="button" onClick={() => onDecide(a.id, "rejected")}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {awaitingPayment.length > 0 && (
        <div className="mt-5 border-t border-soil-200 pt-3">
          <p className="text-sm text-ink-600">Approved — waiting for the investor's online payment (it activates automatically)</p>
          <div className="mt-3 space-y-2">
            {awaitingPayment.map((a) => (
              <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
                <p className="text-xs font-medium text-canopy-800">{a.reference}</p>
                <p className="text-sm text-ink-900">{a.investorName}</p>
                <p className="text-xs text-ink-600">{a.planType === "monthly" ? "Monthly (first month)" : "Bulk"} · ₦{a.amount.toLocaleString()}</p>
                <div className="flex flex-wrap items-start gap-2">
                  <button className="btn-outline mt-2" type="button" onClick={() => onDecide(a.id, "rejected")}>Cancel application</button>
                  <OfflineRecord application={a} onRecordOffline={onRecordOffline} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMonthly.length > 0 && (
        <details className="mt-5 border-t border-soil-200 pt-3">
          <summary className="cursor-pointer text-sm text-ink-600">Active monthly plans ({activeMonthly.length}): record a payment received outside Paystack</summary>
          <div className="mt-3 space-y-2">
            {activeMonthly.map((a) => (
              <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
                <p className="text-xs font-medium text-canopy-800">{a.reference} · {a.investorName}</p>
                <p className="text-xs text-ink-600">Monthly · ₦{a.amount.toLocaleString()}</p>
                <OfflineRecord application={a} onRecordOffline={onRecordOffline} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function PartnerStatusPanel({ reviews, onApprove }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Partner Investor requests</p>
      <div className="mt-3 space-y-2">
        {reviews.filter((r) => r.status === "pending").length === 0 && (
          <p className="text-sm text-ink-600">Nothing pending.</p>
        )}
        {reviews
          .filter((r) => r.status === "pending")
          .map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-sm text-ink-900">{r.investorName}</p>
                <p className="text-xs text-ink-600">
                  ₦{r.totalInvested.toLocaleString()} invested · {r.referralCount} referrals
                </p>
              </div>
              <button className="btn-primary" type="button" onClick={() => onApprove(r.id)}>
                Approve Partner status
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

export function ROIPayoutPanel({ payouts, onApprove }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">ROI payouts</p>
      <div className="mt-3 space-y-2">
        {payouts.filter((p) => p.status === "pending").length === 0 && (
          <p className="text-sm text-ink-600">Nothing pending.</p>
        )}
        {payouts
          .filter((p) => p.status === "pending")
          .map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-sm text-ink-900">{p.investorName}</p>
                <p className="text-xs text-ink-600">
                  Year {p.year} · ₦{p.netPayout.toLocaleString()}
                </p>
              </div>
              <button className="btn-primary" type="button" onClick={() => onApprove(p.id)}>
                Approve payout
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
