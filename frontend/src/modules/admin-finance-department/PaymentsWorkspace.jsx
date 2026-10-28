import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiDownload } from "../../api/client.js";
import PaymentConfirmationPanel from "./PaymentConfirmationPanel.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
const TYPES = ["order", "share", "commitment", "corps_fee", "investment", "consultancy", "savings", "repayment", "boost_deposit"];
const TYPE_LABEL = { order: "Order", share: "Share", commitment: "Commitment", corps_fee: "Corps fee", investment: "Investment", consultancy: "Consultancy", savings: "Savings", repayment: "Repayment", boost_deposit: "Boost deposit" };
const REASON = {
  large_order: "Order above the review threshold", order_missing: "Order no longer exists", no_buyer_profile: "No buyer profile",
};
const btn = "rounded-card border border-soil-200 px-3 py-1 text-xs text-ink-800 hover:bg-soil-50";

function AutoConfirmed() {
  const [rows, setRows] = useState([]);
  const [type, setType] = useState("");
  const [recorded, setRecorded] = useState("");
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (recorded) p.set("recorded", recorded);
    try { setRows((await apiFetch(`/payments/admin/ledger?${p}`)).payments); setMsg(null); } catch (e) { setMsg(e.message); }
  }, [type, recorded]);
  useEffect(() => { load(); }, [load]);

  async function tick(row) {
    try { await apiFetch(`/payments/admin/ledger/${row.id}/recorded`, { method: "POST", body: { recorded: !row.recorded } }); await load(); } catch (e) { setMsg(e.message); }
  }
  async function exportCsv() {
    const p = new URLSearchParams(); if (type) p.set("type", type); if (recorded) p.set("recorded", recorded);
    try { await apiDownload(`/payments/admin/ledger.csv?${p}`, "payments.csv"); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-card border border-soil-200 px-2 py-1 text-sm">
          <option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={recorded} onChange={(e) => setRecorded(e.target.value)} className="rounded-card border border-soil-200 px-2 py-1 text-sm">
          <option value="">Recorded and not</option><option value="false">Not yet recorded</option><option value="true">Recorded</option>
        </select>
        <button className={`${btn} ml-auto`} onClick={exportCsv}>Export spreadsheet (CSV)</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-ink-700">
          <thead><tr className="text-ink-500"><th className="pr-3">Paid</th><th className="pr-3">Type</th><th className="pr-3">Payer</th><th className="pr-3">Net to EPHAAG</th><th className="pr-3">Fee paid by payer</th><th className="pr-3">Total charged</th><th className="pr-3">Flag</th><th>Recorded</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-3 text-ink-600">No payments yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-soil-200 align-top">
                <td className="py-1.5 pr-3">{fmt(r.paid_at)}</td><td className="pr-3">{r.typeLabel}</td>
                <td className="pr-3">{r.payer_name || "—"}<div className="text-ink-500">{r.reference}</div></td>
                <td className="pr-3">{naira(r.net_amount)}</td><td className="pr-3">{naira(r.fee_amount)}</td><td className="pr-3">{naira(r.gross_amount)}</td>
                <td className="pr-3 text-harvest-600">{r.review_reasons ? REASON[r.review_reasons] || r.review_reasons : ""}</td>
                <td><input type="checkbox" checked={r.recorded} onChange={() => tick(r)} aria-label="Recorded in the books" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legacy() {
  const [rows, setRows] = useState([]);
  useEffect(() => { apiFetch("/payments/admin/unfunded-commitments").then((r) => setRows(r.commitments)).catch(() => {}); }, []);
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-600">Standing commitments typed in before payment through Paystack was required. They stay usable, but no money was verified for them.</p>
      {rows.length === 0 && <p className="text-sm text-ink-600">None.</p>}
      {rows.map((r) => (
        <div key={r.user_id} className="flex justify-between rounded-card border border-soil-200 px-3 py-2 text-sm">
          <span>{r.name} <span className="text-xs text-ink-500">{r.email}</span></span>
          <span>{naira(r.standing_commitment_balance)} left of {naira(r.standing_commitment_total)}</span>
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { apiFetch("/payments/admin/settings").then(setS).catch((e) => setMsg(e.message)); }, []);
  if (!s) return <p className="text-sm text-ink-600">{msg || "Loading…"}</p>;
  const setFee = (k, v) => setS({ ...s, fee: { ...s.fee, [k]: v } });
  async function save() {
    try {
      const r = await apiFetch("/payments/admin/settings", { method: "PUT", body: { fee: s.fee, reviewThreshold: s.reviewThreshold === "" ? null : s.reviewThreshold, orderExpiryHours: s.orderExpiryHours, duplicateWindowHours: s.duplicateWindowHours, sharePercentPerMonth: s.sharePercentPerMonth, shareLateCapDays: s.shareLateCapDays, shareGraceDays: s.shareGraceDays } });
      setS(r); setMsg("Saved.");
    } catch (e) { setMsg(e.message); }
  }
  const field = "w-28 rounded-card border border-soil-200 px-2 py-1 text-sm";
  return (
    <div className="max-w-xl space-y-4 text-sm text-ink-800">
      {!s.paystackConfigured && <p className="rounded-card border border-red-200 bg-red-50 px-3 py-2 text-red-700">Paystack is not configured on this server (no secret key). Buyers will see "Online payment unavailable".</p>}
      <div>
        <p className="font-medium">Paystack fee added to the payer's total</p>
        <p className="text-xs text-ink-600">Paystack's published Nigerian rate is 1.5% + ₦100 (the ₦100 is waived under ₦2,500, capped at ₦2,000). International cards cost more and Paystack adds VAT, so check your dashboard and edit these if they differ.</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["percent", "Percent (%)"], ["flat", "Flat (₦)"], ["waiverUnder", "Flat waived under (₦)"], ["cap", "Cap (₦)"]].map(([k, label]) => (
            <label key={k} className="text-xs text-ink-600">{label}<input type="number" step="any" min="0" className={field} value={s.fee[k]} onChange={(e) => setFee(k, e.target.value)} /></label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-600">Example: a ₦10,000 order is charged {naira(s.example.gross)} (fee {naira(s.example.fee)}) so EPHAAG nets ₦10,000.</p>
      </div>
      <label className="block text-xs text-ink-600">Flag orders for review at or above (₦). Leave empty for no size flag.
        <input type="number" min="0" className={`${field} mt-1 block`} value={s.reviewThreshold ?? ""} onChange={(e) => setS({ ...s, reviewThreshold: e.target.value })} /></label>
      <label className="block text-xs text-ink-600">Unpaid orders expire after (hours)
        <input type="number" min="1" max="168" className={`${field} mt-1 block`} value={s.orderExpiryHours} onChange={(e) => setS({ ...s, orderExpiryHours: e.target.value })} /></label>
      <label className="block text-xs text-ink-600">Treat the same items for the same amount ordered again within (hours) as a possible duplicate
        <input type="number" min="1" max="720" className={`${field} mt-1 block`} value={s.duplicateWindowHours} onChange={(e) => setS({ ...s, duplicateWindowHours: e.target.value })} /></label>
      <div>
        <p className="font-medium">Late share payments</p>
        <p className="text-xs text-ink-600">A share purchase that is not paid on time is not refused: the farmer pays a late fee, which stops growing after the number of days below, then has a grace period before the share is taken down.</p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[["sharePercentPerMonth", "Late fee (% of share per month)"], ["shareLateCapDays", "Fee stops growing after (days)"], ["shareGraceDays", "Grace period (days)"]].map(([k, label]) => (
            <label key={k} className="text-xs text-ink-600">{label}<input type="number" step="any" min="0" className={field} value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-600">Refunds are handled in one place only: the Refund room in the Admin Hub.</p>
      <div className="flex items-center gap-3"><button className="btn-primary" onClick={save}>Save settings</button>{msg && <span className="text-xs text-ink-600">{msg}</span>}</div>
    </div>
  );
}

const SUBTABS = [
  { key: "auto", label: "Auto-confirmed" },
  { key: "manual", label: "Manual queue (old)" },
  { key: "legacy", label: "Unfunded commitments (legacy)" },
  { key: "settings", label: "Settings" },
];

export default function PaymentsWorkspace({ orders, onConfirm }) {
  const [sub, setSub] = useUrlState("sub", "auto");
  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm text-ink-600">Payment confirmations</p>
        <p className="mt-1 text-xs text-ink-600">Paystack payments are confirmed automatically and sent to Procurement; nothing needs your approval. Payments that cannot be used are refused by the system itself. "Review only" marks (such as a large order) are for your information. Money that cannot be applied, and any exceptional refund, is handled in the Refund room (Admin Hub).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)} className={`rounded-card px-3 py-1.5 text-sm ${sub === t.key ? "bg-canopy-700 text-white" : "border border-soil-200 text-ink-700 hover:bg-soil-50"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "auto" && <AutoConfirmed />}
      {sub === "manual" && <PaymentConfirmationPanel orders={orders} onConfirm={onConfirm} />}
      {sub === "legacy" && <Legacy />}
      {sub === "settings" && <Settings />}
    </div>
  );
}
