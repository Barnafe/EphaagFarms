import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const DEPOSIT_CHOICES = [
  { value: "2500", label: "₦2,500" },
  { value: "3500", label: "₦3,500" },
  { value: "4500", label: "₦4,500" },
  { value: "custom", label: "₦5,500 & above" },
];

function ConsentModal({ onAgree, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="on-light max-w-md rounded-card bg-white p-6 shadow-xl">
        <h3 className="text-lg font-medium text-ink-900">Before you save</h3>
        <p className="mt-2 text-sm text-ink-700">
          You're about to make a savings deposit. Deposits are only accepted between the
          <strong> 1st and 5th of every month</strong>. Every deposit you make automatically sets
          aside ₦500 into your insurance (risk mitigation) account — the remainder goes into your
          main savings.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          Insurance funds are held by the company as emergency/bridge assistance and aren't
          farmer-withdrawable. Main savings can be withdrawn once due, but never before.
        </p>
        <div className="mt-5 flex gap-3">
          <button className="btn-outline flex-1" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary flex-1" type="button" onClick={onAgree}>
            I agree, continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SavingsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showConsent, setShowConsent] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [choice, setChoice] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/farmers/me/savings");
      setData(d);
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

  const customInvalid = choice === "custom" && customAmount !== "" && (Number(customAmount) < 5500 || Number(customAmount) % 500 !== 0);
  const customReady = choice === "custom" && customAmount !== "" && Number(customAmount) >= 5500 && Number(customAmount) % 500 === 0;

  function resolvedAmount() {
    if (choice === "custom") return customReady ? Number(customAmount) : null;
    return choice ? Number(choice) : null;
  }

  async function handleDeposit() {
    const amt = resolvedAmount();
    if (!amt) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/farmers/me/savings/deposit", { method: "POST", body: { amount: amt } });
      setShowChoices(false);
      setChoice("");
      setCustomAmount("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw(e) {
    e.preventDefault();
    if (!withdrawAmount) return;
    setWithdrawSubmitting(true);
    setError(null);
    try {
      await apiFetch("/farmers/me/savings/withdraw", { method: "POST", body: { amount: Number(withdrawAmount) } });
      setWithdrawAmount("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWithdrawSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-canopy-100">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Savings</h2>
        <p className="mt-1 text-sm text-canopy-100">
          A small monthly deposit goes a long way — part of it builds your savings, part of it
          protects you.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-ink-600">Main savings</p>
          <p className="mt-1 text-2xl font-medium text-canopy-800">
            ₦{(data?.mainBalance ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            {data?.canWithdrawMain
              ? "Withdrawable now."
              : data?.mainWithdrawalUnlocksAt
              ? `Locked until ${new Date(data.mainWithdrawalUnlocksAt).toLocaleDateString()} — one full year after your first deposit.`
              : "Locked for 1 year from your first deposit."}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-600">Insurance (risk mitigation)</p>
          <p className="mt-1 text-2xl font-medium text-harvest-600">
            ₦{(data?.insuranceBalance ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ink-600">Company-managed emergency/bridge fund.</p>
        </div>
      </div>

      <div className="card">
        {!showChoices ? (
          <button
            className="btn-primary"
            type="button"
            onClick={() => setShowConsent(true)}
          >
            Save
          </button>
        ) : (
          <div className="field space-y-3">
            <p className="text-sm text-ink-600">Select saving choice</p>
            <select
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setCustomAmount("");
              }}
            >
              <option value="">Select saving choice</option>
              {DEPOSIT_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {choice === "custom" && (
              <div>
                <label>Amount (₦)</label>
                <input
                  type="number"
                  min="5500"
                  step="500"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="e.g. 6000"
                />
                {customInvalid && (
                  <p className="mt-1 text-xs text-red-700">Amount must end with 500</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button className="btn-outline flex-1" type="button" onClick={() => setShowChoices(false)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                type="button"
                disabled={!resolvedAmount() || submitting}
                onClick={handleDeposit}
              >
                {submitting ? "Saving…" : "Submit"}
              </button>
            </div>
            {data && !data.depositWindowOpen && (
              <p className="text-xs text-harvest-600">
                Deposits are only accepted 1st–5th of the month — you can fill this in now, but it
                will be rejected until the window opens.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Withdraw from main savings</p>
        <form onSubmit={handleWithdraw} className="field mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label>Amount (₦)</label>
            <input
              type="number"
              min="1"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount to withdraw"
            />
          </div>
          <button className="btn-outline" type="submit" disabled={withdrawSubmitting}>
            {withdrawSubmitting ? "Requesting…" : "Request withdrawal"}
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-600">
          Requests are reviewed by Finance — insurance funds can't be withdrawn by farmers.
        </p>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Recent activity</p>
        {(!data || (data.deposits.length === 0 && data.withdrawals.length === 0)) && (
          <p className="mt-2 text-sm text-ink-600">No activity yet.</p>
        )}
        <div className="mt-3 space-y-2">
          {data?.deposits.map((d) => (
            <div key={d.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <p className="text-ink-900">Deposit — ₦{d.amount.toLocaleString()}</p>
              <p className="text-xs text-ink-600">
                ₦{d.mainPortion.toLocaleString()} to main, ₦{d.insurancePortion.toLocaleString()} to
                insurance · {new Date(d.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
          {data?.withdrawals.map((w) => (
            <div key={w.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <p className="text-ink-900">
                Withdrawal ({w.accountType}) — ₦{w.amount.toLocaleString()}
              </p>
              <p className="text-xs text-ink-600">
                {w.status} · {new Date(w.requestedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {showConsent && (
        <ConsentModal
          onCancel={() => setShowConsent(false)}
          onAgree={() => {
            setShowConsent(false);
            setShowChoices(true);
          }}
        />
      )}
    </div>
  );
}
