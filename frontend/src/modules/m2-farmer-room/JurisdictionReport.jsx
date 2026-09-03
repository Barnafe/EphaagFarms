import { useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function JurisdictionReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setReport(await apiFetch("/farmers/me/jurisdiction-report"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-600">Jurisdiction report</p>
          <p className="mt-1 text-xs text-ink-600">
            A snapshot of everything under your jurisdiction, whenever you need it.
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate report"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {report && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-ink-600">
            Scope: {report.scope.rank}
            {report.scope.state ? ` · ${report.scope.state}` : ""}
            {report.scope.lga ? `, ${report.scope.lga}` : ""}
            {report.scope.ward ? `, ${report.scope.ward}` : ""}
            {report.scope.unit ? `, ${report.scope.unit}` : ""}
          </p>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-sm font-medium text-ink-900">{report.totalFarmers} farmers</p>
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">By gender</p>
            {report.byGender.map((r) => (
              <p key={r.key} className="text-sm text-ink-700">{r.key}: {r.count}</p>
            ))}
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">By annual income band</p>
            {report.byAnnualIncome.map((r) => (
              <p key={r.key} className="text-sm text-ink-700">{r.key}: {r.count}</p>
            ))}
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">Produce declared</p>
            {report.produceByCrop.length === 0 && <p className="text-sm text-ink-600">None yet.</p>}
            {report.produceByCrop.map((r) => (
              <p key={r.crop} className="text-sm text-ink-700">{r.crop}: {r.total.toLocaleString()} {r.unit}</p>
            ))}
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">Savings</p>
            <p className="text-sm text-ink-700">Main: ₦{report.savings.mainTotal.toLocaleString()}</p>
            <p className="text-sm text-ink-700">Insurance: ₦{report.savings.insuranceTotal.toLocaleString()}</p>
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">Loans by status</p>
            {report.loansByStatus.length === 0 && <p className="text-sm text-ink-600">None yet.</p>}
            {report.loansByStatus.map((r) => (
              <p key={r.key} className="text-sm text-ink-700">{r.key}: {r.count}</p>
            ))}
          </div>

          <div className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">By leadership rank</p>
            {report.byLeadershipRank.map((r) => (
              <p key={r.key} className="text-sm text-ink-700">{r.key}: {r.count}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
