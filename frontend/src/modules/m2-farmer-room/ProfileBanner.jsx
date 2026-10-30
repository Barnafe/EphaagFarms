// Shown on every Farmer's Room page while sensitive features are locked.
export default function ProfileBanner({ status, onOpenProfile }) {
  if (!status?.restricted) return null;
  const parts = [];
  if (status.needsNin) parts.push("verify your NIN");
  if (status.needsProfile) parts.push("complete your profile");
  return (
    <div className="card mb-6 border-harvest-200 bg-harvest-50" role="alert">
      <p className="text-sm font-medium text-ink-900">Please {parts.join(" and ")}</p>
      <p className="mt-1 text-xs text-ink-700">Loans, savings withdrawals and farm shares are locked until then. Everything else works as usual.</p>
      <button type="button" className="btn-primary mt-2" onClick={onOpenProfile}>Open my profile</button>
    </div>
  );
}
