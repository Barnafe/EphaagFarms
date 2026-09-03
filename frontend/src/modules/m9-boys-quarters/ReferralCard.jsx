export default function ReferralCard({ referral, threshold }) {
  const byAmount = referral.totalInvested >= threshold.amount;
  const byReferrals =
    referral.totalInvested >= threshold.altAmount && referral.referralCount >= threshold.altReferrals;
  const qualifies = byAmount || byReferrals;

  const partnerLabel = {
    none: qualifies ? "Eligible — Partner review not yet started" : "Not yet eligible",
    pending: "Partner status pending Finance review",
    approved: "Partner Investor",
  };

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your referral link</p>
      <p className="mt-1 text-lg font-medium text-canopy-800">{referral.code}</p>
      <p className="mt-1 text-xs text-ink-600">
        {referral.referralCount} referral(s) · ₦{referral.totalInvested.toLocaleString()} total invested
      </p>

      <div className="mt-3 rounded-card bg-soil-50 px-3 py-2 text-sm">
        Partner status: <span className="font-medium text-ink-900">{partnerLabel[referral.partnerStatus]}</span>
      </div>
      <p className="mt-2 text-xs text-ink-600">
        Qualifies at ₦{threshold.amount.toLocaleString()} invested, or ₦
        {threshold.altAmount.toLocaleString()} + {threshold.altReferrals} referrals.
      </p>
    </div>
  );
}
