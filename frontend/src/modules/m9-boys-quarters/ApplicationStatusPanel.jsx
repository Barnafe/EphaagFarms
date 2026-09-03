const statusCopy = {
  submitted: { label: "Submitted — awaiting Finance Department review", tone: "text-harvest-600" },
  agreement_pending: { label: "Approved by Finance — agreement emailed to you, awaiting your signed upload", tone: "text-harvest-600" },
  agreement_review: { label: "Signed agreement received — awaiting Finance's final review", tone: "text-harvest-600" },
  active: { label: "Active investment", tone: "text-canopy-800" },
  rejected: { label: "Not approved", tone: "text-red-700" },
};

export default function ApplicationStatusPanel({ application }) {
  const status = statusCopy[application.status];

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Application status</p>
      <p className={`mt-1 text-lg font-medium ${status.tone}`}>{status.label}</p>
      <p className="mt-1 text-xs font-medium text-canopy-800">{application.reference}</p>
      <p className="mt-2 text-sm text-ink-600">
        {application.planType === "monthly" ? "Monthly plan" : "Bulk (one-time)"} · ₦
        {application.amount.toLocaleString()} · {application.durationYears} year(s)
        {application.planType === "monthly" && ` · ${application.paymentMode === "auto" ? "auto-charge" : "manual payment"}`}
      </p>
      {application.status === "agreement_pending" && (
        <p className="mt-2 text-xs text-ink-600">
          Check your email for the agreement form — download, fill it in, sign it, then upload
          the signed copy below.
        </p>
      )}
    </div>
  );
}
