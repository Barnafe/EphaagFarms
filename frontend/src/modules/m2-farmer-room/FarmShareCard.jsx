import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const SHARE_PRICE = 25000;
const ANNUAL_ROI_PCT = 10;
const LOCK_YEARS = 5;

const STATUS_TONE = {
  active: "bg-canopy-50 text-canopy-800",
  capital_withdrawn: "bg-soil-100 text-ink-600",
};

export default function FarmShareCard() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { shares } = await apiFetch("/farmers/me/shares");
      setShares(shares);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleBuy() {
    setSubmitting(true);
    try {
      await apiFetch("/farmers/me/shares", { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdrawInterest(shareId, year) {
    try {
      await apiFetch(`/farmers/me/shares/${shareId}/withdraw-interest`, {
        method: "POST",
        body: { year },
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleWithdrawCapital(shareId) {
    try {
      await apiFetch(`/farmers/me/shares/${shareId}/withdraw-capital`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Buy Share</p>
      <p className="mt-1 text-xs text-ink-600">
        One share is ₦{SHARE_PRICE.toLocaleString()}. Your capital is locked for {LOCK_YEARS} years and can't
        be withdrawn before then — but the interest ({ANNUAL_ROI_PCT}% of your capital) becomes available to
        withdraw once every year, starting after your first full year. Interest is always calculated on your
        original capital only — it never compounds, whether or not you withdraw it each year.
      </p>

      <button className="btn-primary mt-4" type="button" onClick={handleBuy} disabled={submitting}>
        {submitting ? "Buying…" : `Buy a share — ₦${SHARE_PRICE.toLocaleString()}`}
      </button>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!loading && shares.length > 0 && (
        <div className="mt-4 space-y-3">
          {shares.map((s) => (
            <div key={s.id} className="rounded-card border border-soil-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="text-ink-900">
                  ₦{s.amount.toLocaleString()} · {s.annualRoiPct}%/yr on capital
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[s.status] || STATUS_TONE.active}`}>
                  {s.status === "capital_withdrawn" ? "Capital withdrawn" : "Active"}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-600">
                Purchased {new Date(s.purchasedAt).toLocaleDateString()} · Capital unlocks{" "}
                {new Date(s.capitalUnlocksAt).toLocaleDateString()}
              </p>

              <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-5">
                {s.interestYears.map((y) => (
                  <div key={y.year} className="rounded-card bg-soil-50 p-1.5 text-center">
                    <p className="text-[10px] text-ink-600">Yr {y.year}</p>
                    <p className="text-xs font-medium text-canopy-800">₦{y.amount.toLocaleString()}</p>
                    {y.withdrawn ? (
                      <p className="text-[10px] text-ink-600">Withdrawn</p>
                    ) : y.withdrawable ? (
                      <button
                        className="text-[10px] text-canopy-800 underline"
                        onClick={() => handleWithdrawInterest(s.id, y.year)}
                      >
                        Withdraw
                      </button>
                    ) : (
                      <p className="text-[10px] text-ink-400">Locked</p>
                    )}
                  </div>
                ))}
              </div>

              {s.status !== "capital_withdrawn" && (
                <button
                  className="mt-2 text-xs text-canopy-800 underline disabled:text-ink-400 disabled:no-underline"
                  disabled={!s.capitalWithdrawable}
                  onClick={() => handleWithdrawCapital(s.id)}
                >
                  {s.capitalWithdrawable ? "Withdraw capital" : "Capital still locked"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
