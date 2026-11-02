import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { BarChartCard, HorizontalBarChartCard, PieChartCard, LineChartCard, CHART_COLORS } from "./AnalyticsCharts.jsx";

const naira = (v) => `₦${Number(v).toLocaleString()}`;
const count = (v) => Number(v).toLocaleString();

function Tile({ label, value, sub, testId }) {
  return (
    <div className="card">
      <p className="text-xs text-ink-600">{label}</p>
      <p className="mt-1 text-2xl font-medium text-canopy-800" data-testid={testId}>{value}</p>
      {sub && <p className="text-xs text-ink-600">{sub}</p>}
    </div>
  );
}

/** The four key charts (overview, produce by crop and area, loans, savings trend) for the chosen location. */
export default function KeyCharts({ qs, onError }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setS(null);
    apiFetch(`/analytics/summary${qs ? `?${qs}` : ""}`).then((d) => { if (!cancelled) { setS(d); onError?.(null); } }).catch((e) => onError?.(e.message));
    return () => { cancelled = true; };
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <p className="text-sm text-canopy-100">Loading the charts…</p>;
  const t = s.totals;
  return (
    <div className="space-y-4" data-testid="key-charts">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Registered farmers" value={count(t.farmers)} sub={`${count(t.farmersDeclaring)} declared produce`} testId="tile-farmers" />
        <Tile label="Loans" value={count(t.loans)} sub={naira(t.loanValue)} testId="tile-loans" />
        <Tile label="Savings deposited" value={naira(t.savings)} sub={`${count(t.savers)} farmers saving`} testId="tile-savings" />
        <Tile label="Farmer shares" value={count(t.shares)} sub={`${naira(t.sharesInvested)} invested`} />
      </div>
      <HorizontalBarChartCard
        title="Produce declared, by crop"
        subtitle="Each crop in its own unit. Hover a bar for the number of farmers."
        data={s.produceByCrop.map((r) => ({ key: `${r.crop} (${r.unit})`, value: r.total, farmers: r.farmers }))}
        color={CHART_COLORS[1]}
        valueFormatter={(v, _n, item) => (item?.payload ? `${Number(v).toLocaleString()} (${item.payload.farmers} farmers)` : v)}
      />
      <BarChartCard
        title={`Farmers by ${s.areaLevelLabel.toLowerCase()}`}
        subtitle={s.areaLevel === "unit" ? "The units in this ward." : `Choose a ${s.areaLevelLabel.toLowerCase()} above to go one level deeper.`}
        data={s.byArea.map((r) => ({ key: r.area, value: r.farmers }))}
        valueFormatter={count}
      />
      <PieChartCard title="Loans by status" data={s.loansByStatus.map((r) => ({ key: r.status, value: r.count }))} valueFormatter={count} />
      <LineChartCard title="Savings deposited, month by month" subtitle="The last 12 months, oldest to newest." data={s.savingsTrend.map((r) => ({ key: r.month, value: r.total }))} valueFormatter={naira} />
    </div>
  );
}
