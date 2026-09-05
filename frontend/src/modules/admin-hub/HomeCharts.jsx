import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

// Brand-consistent chart palette for the dark red (.card) surfaces used
// throughout the admin dashboard. Deliberately built around the company's
// green + red identity: canopy (green) for money coming in / healthy /
// remaining, clay (red) for money going out / spent / used — with harvest
// gold and soil tan as the neutral accents for anything that's neither.
// Colors are pulled a shade lighter than the base brand tones (canopy-300,
// clay-300-ish) since the card background itself is already a dark red
// (clay-800) — darker chart colors on a dark red card would disappear.
export const FLOW_GREEN = "#7bb066"; // canopy-300
export const FLOW_RED = "#f0827f"; // lightened clay, readable on clay-800
export const GOLD = "#f0b93f"; // matches the .on-light gold used elsewhere
export const TAN = "#e6dccd"; // cream-tan, matches the dash-scope text-ink-600 remap
export const CREAM = "#f6f4ef"; // matches the dash-scope text-ink-900 remap

export const CATEGORY_COLORS = [FLOW_GREEN, FLOW_RED, GOLD, "#9cc48b", "#f3dda3", TAN, "#4f8c3f", "#e0524f"];

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "#5c0a10",
  color: CREAM,
  fontSize: 12,
};

function nairaShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₦${(v / 1_000).toFixed(0)}K`;
  return `₦${v}`;
}

// Dual-line cash flow chart — inflow (green) vs outflow (red) over a
// series of dated points. `data` is [{ label, inflow, outflow }, ...].
export function CashFlowChart({ data, height = 240 }) {
  const rows = data || [];
  if (rows.length === 0) {
    return <p className="text-sm text-ink-600">No transactions recorded yet this month.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: TAN }} axisLine={{ stroke: "rgba(255,255,255,0.2)" }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: TAN }} width={44} tickFormatter={nairaShort} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [nairaShort(value), name === "inflow" ? "Inflow" : "Outflow"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: TAN }} formatter={(v) => (v === "inflow" ? "Inflow" : "Outflow")} />
        <Line type="monotone" dataKey="inflow" stroke={FLOW_GREEN} strokeWidth={2.5} dot={{ r: 2.5 }} />
        <Line type="monotone" dataKey="outflow" stroke={FLOW_RED} strokeWidth={2.5} dot={{ r: 2.5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Center-labeled donut for a used/remaining split (e.g. budget
// utilization). `segments` is [{ key, value, color }, ...]; `centerLabel`
// / `centerSubLabel` render stacked in the donut's middle.
export function SplitDonut({ segments, centerLabel, centerSubLabel, height = 200 }) {
  const rows = (segments || []).filter((s) => s.value > 0);
  if (rows.length === 0) {
    return <p className="text-sm text-ink-600">No budget data yet.</p>;
  }
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="key" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
            {rows.map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [nairaShort(value), name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-semibold text-white">{centerLabel}</p>
        {centerSubLabel && <p className="text-xs text-ink-600">{centerSubLabel}</p>}
      </div>
    </div>
  );
}

// Category donut with a side legend showing share % and amount — used for
// "top expenses by category". `data` is [{ key, value }, ...].
export function CategoryDonut({ data, height = 200 }) {
  const rows = (data || []).filter((r) => Number(r.value) > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  if (rows.length === 0 || total === 0) {
    return <p className="text-sm text-ink-600">No expenses recorded yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div style={{ height, width: height }} className="mx-auto shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="key" innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="none">
              {rows.map((_, i) => (
                <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [nairaShort(value), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-2">
        {rows.slice(0, 6).map((r, i) => (
          <li key={r.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
              <span className="truncate">{r.key}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-white">
              {Math.round((r.value / total) * 100)}% <span className="text-ink-600">({nairaShort(r.value)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
