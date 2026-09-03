import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

// 2026-09-01 spec: registered buyers must be visible to admin the same
// way farmers already are — a full directory of every buyer's
// registration info, company-wide (not scoped), same visibility model as
// the admin branch of farmers.jurisdictionOverview.
export default function BuyersDirectory() {
  const [buyers, setBuyers] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { buyers } = await apiFetch("/buyers/admin");
      setBuyers(buyers);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = buyers.filter((b) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      b.name?.toLowerCase().includes(q) ||
      b.email?.toLowerCase().includes(q) ||
      b.phone?.toLowerCase().includes(q) ||
      b.organizationName?.toLowerCase().includes(q)
    );
  });

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Buyers</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Every registered buyer — individuals and organizations — with their full registration
            details.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="card">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, or organization"
            className="w-full rounded-card border border-soil-200 bg-soil-50 px-3 py-2 text-sm text-ink-900 focus:border-canopy-400 focus:outline-none"
          />
        </div>

        {loading ? (
          <p className="text-sm text-canopy-100">Loading…</p>
        ) : (
          <div className="card">
            <p className="text-sm text-ink-600">
              {visible.length} buyer{visible.length === 1 ? "" : "s"}
            </p>
            <div className="mt-3 space-y-2">
              {visible.length === 0 && (
                <p className="py-4 text-center text-sm text-ink-600">No buyers match that search.</p>
              )}
              {visible.map((b) => (
                <div key={b.id} className="rounded-card border border-soil-200 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">
                        {b.buyerType === "organization" ? b.organizationName || b.name : b.name}
                      </p>
                      <p className="text-xs text-ink-600">
                        {b.buyerType === "organization" ? "Organization" : "Individual"} ·{" "}
                        {b.email || "no email"} · {b.phone || "no phone"}
                      </p>
                    </div>
                    <span className="rounded-full bg-canopy-50 px-2 py-1 text-xs text-canopy-800">
                      ₦{b.standingCommitmentBalance.toLocaleString()} standing balance
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600 sm:grid-cols-3">
                    <p>State: {b.state || "—"}</p>
                    <p>LGA: {b.lga || "—"}</p>
                    <p>Registered: {(b.createdAt || "").slice(0, 10) || "—"}</p>
                    {b.buyerType === "organization" ? (
                      <>
                        <p className="col-span-2">Contact person: {b.contactPersonName || "—"}</p>
                        <p className="col-span-3">Registered address: {b.registeredAddress || "—"}</p>
                      </>
                    ) : (
                      <p className="col-span-3">Delivery address: {b.address || "—"}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminDashboardShell>
  );
}
