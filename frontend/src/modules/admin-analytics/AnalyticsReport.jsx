import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { describeGeo, GEO_LEVELS } from "./GeoFilters.jsx";

const naira = (v) => `₦${Number(v).toLocaleString()}`;
const num = (v) => Number(v).toLocaleString();
const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-NG", { month: "short", year: "numeric" }); };

function Table({ head, rows, testId }) {
  return (
    <table className="w-full border-collapse text-sm" data-testid={testId}>
      <thead><tr>{head.map((h, i) => <th key={h} className={`border-b border-stone-400 py-1 text-xs uppercase tracking-wide text-stone-600 ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={head.length} className="py-2 text-stone-500">Nothing recorded for this location yet.</td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className={`border-b border-stone-200 py-1 ${j ? "text-right" : "text-left"}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** A printable summary report: opens in its own page; Print (or Save as PDF) uses the browser. */
export default function AnalyticsReport() {
  const { search } = useLocation();
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { apiFetch(`/analytics/summary${search}`).then(setS).catch((e) => setErr(e.message)); }, [search]);
  const geo = s ? s.filters : Object.fromEntries(GEO_LEVELS.map((l) => [l, new URLSearchParams(search).get(l) || ""]));
  const back = `/admin/analytics${search}`;

  return (
    <div className="min-h-screen bg-white text-stone-900 print:min-h-0">
      <div className="print:hidden border-b border-stone-200 bg-stone-50 px-6 py-3 flex items-center justify-between">
        <Link to={back} className="flex items-center gap-1 text-sm text-canopy-800"><ArrowLeft size={16} /> Back to Analytics</Link>
        <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}><Printer size={16} /> Print or save as PDF</button>
      </div>
      <main className="mx-auto max-w-3xl px-8 py-8 space-y-6" data-testid="report">
        {err && <p className="text-red-700">{err}</p>}
        {!s && !err && <p>Preparing the report…</p>}
        {s && (
          <>
            <header className="border-b-2 border-stone-800 pb-3">
              <p className="text-xs uppercase tracking-widest text-stone-600">EPHAAG Farms</p>
              <h1 className="text-2xl font-semibold">Analytics summary report</h1>
              <p className="mt-1 text-sm" data-testid="report-location">Location: {describeGeo(geo)}</p>
              <p className="text-xs text-stone-600">Prepared {new Date(s.generatedAt).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short" })}</p>
            </header>

            <section>
              <h2 className="mb-2 text-base font-semibold">At a glance</h2>
              <Table testId="report-totals" head={["Measure", "Value"]} rows={[
                ["Registered farmers", num(s.totals.farmers)],
                ["Farmers who declared produce", num(s.totals.farmersDeclaring)],
                ["Loans (number)", num(s.totals.loans)],
                ["Loans (total value)", naira(s.totals.loanValue)],
                ["Savings deposited", naira(s.totals.savings)],
                ["Farmers saving", num(s.totals.savers)],
                ["Farmer shares held", num(s.totals.shares)],
                ["Farmer shares invested", naira(s.totals.sharesInvested)],
              ]} />
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold">Produce declared, by crop</h2>
              <Table head={["Crop", "Unit", "Total declared", "Farmers"]} rows={s.produceByCrop.map((r) => [r.crop, r.unit, num(r.total), num(r.farmers)])} />
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold">By {s.areaLevelLabel.toLowerCase()}</h2>
              <Table head={[s.areaLevelLabel, "Farmers", "Declaring produce", "Loan value"]} rows={s.byArea.map((r) => [r.area, num(r.farmers), num(r.declarers), naira(r.loanValue)])} />
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold">Loans</h2>
              <Table head={["Status", "Number", "Value"]} rows={s.loansByStatus.map((r) => [r.status, num(r.count), naira(r.totalAmount)])} />
              <div className="h-3" />
              <Table head={["Loan type", "Number", "Value"]} rows={s.loansByType.map((r) => [r.loanType, num(r.count), naira(r.totalAmount)])} />
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold">Savings, month by month</h2>
              <Table head={["Month", "Deposited", "Deposits"]} rows={s.savingsTrend.map((r) => [monthLabel(r.month), naira(r.total), num(r.deposits)])} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
