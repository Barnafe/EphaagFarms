import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import {
  SHARE_PRICE,
  SHARE_LOCK_YEARS,
  SHARE_YEAR_RATES,
  SHARE_TABLE_ROWS,
  MAX_SHARES_PER_PURCHASE,
  shareRow,
  naira,
} from "../../data/financingBanner.js";

const STATUS_TONE = {
  active: "bg-canopy-50 text-canopy-800",
  capital_withdrawn: "bg-soil-100 text-ink-600",
};

// Farmers' shares — "Shared Capital Investment and Rewards".
//
// Flow (no agreement — farmers are already members):
//   1. choose how many shares   -> POST /farmers/me/shares/checkout
//   2. pay                      -> provider screen / redirect
//   3. the system verifies the payment itself
//                               -> POST /farmers/me/shares/purchases/:ref/verify
//   4. redirected to the details of the share(s) just bought.
// Every share is its own record — own dates, own interest years, own
// withdrawals. Nothing is ever merged.

function BannerTable() {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="text-ink-600">
            <th className="py-1 pr-2 font-medium">Shares</th>
            <th className="py-1 pr-2 font-medium">Capital</th>
            {SHARE_YEAR_RATES.map((pct, i) => (
              <th key={i} className="py-1 pr-2 font-medium">Yr {i + 1} · {pct}%</th>
            ))}
            <th className="py-1 pr-2 font-medium">Total ROI</th>
            <th className="py-1 font-medium">ROI + capital</th>
          </tr>
        </thead>
        <tbody>
          {SHARE_TABLE_ROWS.map((n) => {
            const r = shareRow(n);
            return (
              <tr key={n} className="border-t border-soil-200 text-ink-900">
                <td className="py-1 pr-2">{n}</td>
                <td className="py-1 pr-2">{naira(r.capital)}</td>
                {r.years.map((y, i) => (
                  <td key={i} className="py-1 pr-2">{naira(y)}</td>
                ))}
                <td className="py-1 pr-2">{naira(r.totalRoi)}</td>
                <td className="py-1 font-medium text-canopy-800">{naira(r.payout)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShareDetail({ share, index, onWithdrawInterest, onWithdrawCapital }) {
  return (
    <div className="rounded-card border border-soil-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink-900">
          {index != null ? `Share ${index + 1} · ` : ""}
          {share.reference} · {naira(share.amount)}
        </p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[share.status] || STATUS_TONE.active}`}>
          {share.status === "capital_withdrawn" ? "Capital withdrawn" : "Active"}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-600">
        Purchased {new Date(share.purchasedAt).toLocaleDateString()} · Capital unlocks{" "}
        {new Date(share.capitalUnlocksAt).toLocaleDateString()}
      </p>
      <p className="mt-1 text-xs text-ink-600">
        Over {SHARE_LOCK_YEARS} years this share earns {naira(share.expectedTotalInterest)} — {naira(share.expectedPayoutAtYear5)}{" "}
        with your capital back.
        {share.totalInterestWithdrawn > 0 && <> Interest withdrawn so far: {naira(share.totalInterestWithdrawn)}.</>}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-5">
        {share.interestYears.map((y) => (
          <div key={y.year} className="rounded-card bg-soil-50 p-1.5 text-center">
            <p className="text-[10px] text-ink-600">Yr {y.year} · {y.pct}%</p>
            <p className="text-xs font-medium text-canopy-800">{naira(y.amount)}</p>
            {y.withdrawn ? (
              <p className="text-[10px] text-ink-600">Withdrawn</p>
            ) : y.withdrawable ? (
              <button className="text-[10px] text-canopy-800 underline" onClick={() => onWithdrawInterest(share.id, y.year)}>
                Withdraw
              </button>
            ) : (
              <p className="text-[10px] text-ink-400">{share.status === "capital_withdrawn" ? "—" : "Locked"}</p>
            )}
          </div>
        ))}
      </div>

      {share.status !== "capital_withdrawn" && (
        <button
          className="mt-2 text-xs text-canopy-800 underline disabled:text-ink-400 disabled:no-underline"
          disabled={!share.capitalWithdrawable}
          onClick={() => onWithdrawCapital(share.id)}
        >
          {share.capitalWithdrawable ? "Withdraw capital" : "Capital still locked"}
        </button>
      )}
    </div>
  );
}

export default function FarmShareCard() {
  const [view, setView] = useState("list"); // list | pay | bought
  const [shares, setShares] = useState([]);
  const [pending, setPending] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [purchase, setPurchase] = useState(null);
  const [bought, setBought] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [quote, setQuote] = useState(null);

  const load = useCallback(async () => {
    try {
      const { shares: s, pendingPurchases } = await apiFetch("/farmers/me/shares");
      setShares(s);
      setPending(pendingPurchases || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // What the processing fee will be for the number of shares chosen.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/farmers/shares/quote?quantity=${quantity}`).then((q) => !cancelled && setQuote(q)).catch(() => !cancelled && setQuote(null));
    return () => { cancelled = true; };
  }, [quantity]);

  // Asks the server (which asks Paystack) what happened to a purchase. The answer is a plain outcome.
  const verify = useCallback(
    async (reference) => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const res = await apiFetch(`/farmers/me/shares/purchases/${encodeURIComponent(reference)}/verify`, { method: "POST" });
        if (res.outcome === "success") {
          setBought(res.shares);
          setPurchase(null);
          setView("bought"); // redirect to the details of the share(s) just bought
        } else if (res.outcome === "refused") {
          setView("list"); setPurchase(null);
          setError(`Your payment could not be used because ${res.refusalText || "it could not be applied"}. Nothing has been bought with it, and it will be returned to your original payment method. A message has been sent to you.`);
        } else if (res.outcome === "expired") {
          setView("list"); setPurchase(null);
          setError("This purchase has expired, so it can no longer be paid. Please start a new one.");
        } else if (res.outcome === "failed") {
          setInfo("The payment did not go through and you have not been charged. You can pay again.");
          if (res.purchase?.status === "pending") setPurchase(res.purchase);
        } else {
          setInfo(res.unreachable ? "We couldn't reach the payment service just now. Please check again in a moment." : "We haven't received your payment yet. If you have just paid, check again in a moment.");
        }
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
    // Returning from the payment provider: ?sharePayment=<reference>
    const ref = new URLSearchParams(window.location.search).get("sharePayment");
    if (ref) {
      window.history.replaceState({}, "", window.location.pathname);
      verify(ref);
    }
  }, [load, verify]);

  async function handleCheckout(e, confirmDuplicate = false) {
    e?.preventDefault?.();
    setError(null);
    setInfo(null);
    setDuplicate(null);
    setBusy(true);
    try {
      const { purchase: p } = await apiFetch("/farmers/me/shares/checkout", { method: "POST", body: { quantity, ...(confirmDuplicate === true ? { confirmDuplicate: true } : {}) } });
      setPurchase(p);
      setView("pay");
    } catch (err) {
      if (err.code === "DUPLICATE_PURCHASE") setDuplicate({ kind: err.kind, ...err.duplicate });
      else if (err.code === "PAYMENT_NOT_STARTED" && err.purchase) { setPurchase(err.purchase); setView("pay"); setError(err.message); }
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Opens Paystack for a purchase (a fresh attempt if the old one is used up).
  async function handlePay(target = purchase) {
    setError(null); setInfo(null);
    if (target.provider === "paystack") {
      setBusy(true);
      try {
        const r = await apiFetch(`/farmers/me/shares/purchases/${encodeURIComponent(target.reference)}/pay`, { method: "POST" });
        if (r.alreadyPaid) { setInfo(r.message || "This purchase has already been paid."); await load(); setView("list"); return; }
        if (r.purchase?.authorizationUrl) { window.location.href = r.purchase.authorizationUrl; return; } // returns here with ?sharePayment=
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    verify(target.reference); // simulated provider (local testing only): verified immediately
  }

  async function handleCancelPurchase(reference) {
    try { await apiFetch(`/farmers/me/shares/purchases/${encodeURIComponent(reference)}/cancel`, { method: "POST" }); setInfo("Purchase cancelled."); }
    catch (err) { setError(err.message); }
    await load();
  }

  async function refreshAfterWithdrawal() {
    await load();
    if (bought.length) {
      const fresh = await Promise.all(bought.map((b) => apiFetch(`/farmers/me/shares/${b.id}`).then((r) => r.share)));
      setBought(fresh);
    }
  }

  async function handleWithdrawInterest(shareId, year) {
    try {
      await apiFetch(`/farmers/me/shares/${shareId}/withdraw-interest`, { method: "POST", body: { year } });
      setError(null);
      await refreshAfterWithdrawal();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleWithdrawCapital(shareId) {
    try {
      await apiFetch(`/farmers/me/shares/${shareId}/withdraw-capital`, { method: "POST" });
      setError(null);
      await refreshAfterWithdrawal();
    } catch (err) {
      setError(err.message);
    }
  }

  const total = quantity * SHARE_PRICE;

  if (view === "pay" && purchase) {
    const simulated = purchase.provider === "simulated";
    return (
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Pay for your shares</p>
          <button type="button" className="text-sm text-canopy-800" onClick={() => { setView("list"); setPurchase(null); setError(null); load(); }}>
            ← Back
          </button>
        </div>
        {simulated && (
          <div className="rounded-card border border-dashed border-gray-300 bg-soil-50 px-3 py-2 text-xs text-ink-600">
            Test payment for local testing only: no real money moves.
          </div>
        )}
        <div className="rounded-card bg-soil-50 px-3 py-2 text-sm">
          <p className="flex justify-between"><span className="text-ink-600">Shares</span><span>{purchase.quantity} × {naira(purchase.unitPrice)} = {naira(purchase.total)}</span></p>
          {purchase.fee > 0 && <p className="flex justify-between"><span className="text-ink-600">Payment processing fee</span><span>{naira(purchase.fee)}</span></p>}
          <p className="flex justify-between"><span className="text-ink-600">Reference</span><span>{purchase.reference}</span></p>
          <p className="mt-1 flex justify-between font-medium"><span>Total to pay</span><span>{naira(purchase.amountCharged)}</span></p>
        </div>
        <p className="text-xs text-ink-600">
          Each share is tracked separately, with its own interest and withdrawals. Your capital is exactly {naira(purchase.total)}:
          the processing fee only covers the payment gateway. There's no agreement to sign. Once your payment is verified you'll
          go straight to your share details. Pay within 24 hours or this purchase expires.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-canopy-800">{info}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="button" onClick={() => handlePay()} disabled={busy}>
            {busy ? "Please wait…" : simulated ? `Pay ${naira(purchase.amountCharged)} (test)` : `Pay ${naira(purchase.amountCharged)} with Paystack`}
          </button>
          {!simulated && (
            <button className="btn-outline" type="button" onClick={() => verify(purchase.reference)} disabled={busy}>
              Check my payment
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === "bought") {
    return (
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-canopy-800">
            Payment verified — {bought.length} share{bought.length === 1 ? " is" : "s are"} now active
          </p>
          <button type="button" className="text-sm text-canopy-800" onClick={() => { setView("list"); setBought([]); }}>
            ← All my shares
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {bought.map((s, i) => (
          <ShareDetail
            key={s.id}
            share={s}
            index={bought.length > 1 ? i : null}
            onWithdrawInterest={handleWithdrawInterest}
            onWithdrawCapital={handleWithdrawCapital}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Shared Capital Investment and Rewards</p>
      <p className="mt-1 text-xs text-ink-600">
        One share is {naira(SHARE_PRICE)}, locked for {SHARE_LOCK_YEARS} years. Every year you earn a return on your
        original capital — {SHARE_YEAR_RATES.map((p, i) => `${p}% in year ${i + 1}`).join(", ")} — and each year's
        interest can be withdrawn once that year is complete. Interest is never compounded. Each share you buy is
        treated on its own: its own interest, its own withdrawals and its own capital.
      </p>
      <BannerTable />

      <form onSubmit={handleCheckout} className="field mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-ink-600">How many shares? (1–{MAX_SHARES_PER_PURCHASE} per purchase)</label>
          <input
            type="number"
            min={1}
            max={MAX_SHARES_PER_PURCHASE}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_SHARES_PER_PURCHASE, Math.floor(Number(e.target.value) || 1))))}
          />
          <p className="mt-1 text-xs text-ink-600">
            Capital: {naira(total)} · returns {naira(shareRow(quantity).totalRoi)} over {SHARE_LOCK_YEARS} years
          </p>
          {quote && quote.fee > 0 && (
            <p className="mt-1 text-xs text-ink-600">Payment processing fee {naira(quote.fee)} · you pay {naira(quote.amountCharged)} in total</p>
          )}
        </div>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : "Buy & pay"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {info && <p className="mt-3 text-sm text-canopy-800">{info}</p>}

      {duplicate && (
        <div className="on-light mt-4 space-y-3 rounded-card border border-harvest-300 bg-harvest-50 p-4" role="alert">
          <p className="text-sm font-medium text-gray-900">
            {duplicate.kind === "paid" ? "You have already paid for this" : "You already have this purchase waiting for payment"}
          </p>
          <p className="text-sm text-gray-700">
            {duplicate.kind === "paid"
              ? `Purchase ${duplicate.reference} (${naira(duplicate.total)}) was paid ${duplicate.paidAt ? "on " + new Date(duplicate.paidAt).toLocaleString() : "recently"} and your shares are already active. If you chose the same number of shares by mistake, you do not need to pay again.`
              : `Purchase ${duplicate.reference} for the same number of shares is still unpaid. You can pay for that one instead of creating another.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-card border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800" onClick={() => setDuplicate(null)}>
              {duplicate.kind === "paid" ? "No, I don't need to pay again" : "Cancel"}
            </button>
            {duplicate.kind === "unpaid" && duplicate.canPay && (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => { const p = pending.find((x) => x.id === duplicate.id); setDuplicate(null); if (p) handlePay(p); }}>
                Pay for the existing purchase
              </button>
            )}
            <button type="button" className="rounded-card border border-harvest-600 px-3 py-2 text-sm font-medium text-harvest-600" disabled={busy} onClick={() => handleCheckout(null, true)}>
              Proceed to pay again
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-card border border-soil-200 bg-soil-50 px-3 py-2 text-xs text-ink-900">
              <span>
                Payment not confirmed yet — {p.quantity} share{p.quantity === 1 ? "" : "s"} ({naira(p.amountCharged)}) · {p.reference}
              </span>
              <span className="flex gap-3">
                <button className="text-canopy-800 underline" onClick={() => handlePay(p)}>Pay again</button>
                <button className="text-canopy-800 underline" onClick={() => verify(p.reference)}>Check my payment</button>
                <button className="text-canopy-800 underline" onClick={() => handleCancelPurchase(p.reference)}>Cancel</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && shares.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-ink-600">Your shares ({shares.length})</p>
          {shares.map((s) => (
            <ShareDetail
              key={s.id}
              share={s}
              onWithdrawInterest={handleWithdrawInterest}
              onWithdrawCapital={handleWithdrawCapital}
            />
          ))}
        </div>
      )}
    </div>
  );
}
