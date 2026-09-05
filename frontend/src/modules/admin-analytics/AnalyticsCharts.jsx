import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

// Palette pulled from tailwind.config.js so charts read as part of the app,
// not a bolted-on library default.
export const CHART_COLORS = [
  "#4f8c3f", // canopy-400
  "#dba532", // harvest-400
  "#e0524f", // clay-400
  "#a68a55", // soil-400
  "#2c6b2f", // canopy-600
  "#a97918", // harvest-600
  "#9cc48b", // canopy-200
  "#c81020", // clay-600
];

function ChartShell({ title, subtitle, empty, children }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">{title}</p>
      {subtitle && <p className="text-xs text-ink-600">{subtitle}</p>}
      {empty ? <p className="mt-2 text-sm text-ink-600">No data yet.</p> : <div className="mt-2">{children}</div>}
    </div>
  );
}

function truncate(label, max = 12) {
  if (typeof label !== "string" || label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

// Small vertical bar chart — good default for a handful of categories.
export function BarChartCard({ title, subtitle, data, color = CHART_COLORS[0], valueFormatter, height = 220 }) {
  const rows = data || [];
  return (
    <ChartShell title={title} subtitle={subtitle} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#efe6cf" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fontSize: 11, fill: "#4a463c" }}
            tickFormatter={(v) => truncate(v)}
            interval={0}
            angle={rows.length > 5 ? -25 : 0}
            textAnchor={rows.length > 5 ? "end" : "middle"}
            height={rows.length > 5 ? 46 : 24}
          />
          <YAxis tick={{ fontSize: 11, fill: "#4a463c" }} allowDecimals={false} width={40} />
          <Tooltip
            formatter={(value, name, item) => (valueFormatter ? valueFormatter(value, name, item) : value)}
            contentStyle={{ borderRadius: 10, borderColor: "#ddccA0", fontSize: 12 }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// Horizontal bars — for categories with many entries or long labels (e.g.
// all 36+ Nigerian states), where a vertical chart's x-axis labels would
// collide. Height grows with the row count instead of squeezing bars.
export function HorizontalBarChartCard({ title, subtitle, data, color = CHART_COLORS[0], valueFormatter }) {
  const rows = data || [];
  const height = Math.max(180, Math.min(rows.length * 26, 620));
  return (
    <ChartShell title={title} subtitle={subtitle} empty={rows.length === 0}>
      <div style={{ maxHeight: 420, overflowY: rows.length * 26 > 420 ? "auto" : "visible" }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#efe6cf" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#4a463c" }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="key"
              tick={{ fontSize: 11, fill: "#4a463c" }}
              width={90}
              tickFormatter={(v) => truncate(v, 14)}
            />
            <Tooltip
              formatter={(value, name, item) => (valueFormatter ? valueFormatter(value, name, item) : value)}
              contentStyle={{ borderRadius: 10, borderColor: "#ddccA0", fontSize: 12 }}
            />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

// Donut chart — for a small number of categories where the proportion of
// the whole (e.g. share of loans by status) matters more than raw counts.
export function PieChartCard({ title, subtitle, data, valueFormatter, height = 240 }) {
  const rows = data || [];
  const total = rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
  return (
    <ChartShell title={title} subtitle={subtitle} empty={rows.length === 0 || total === 0}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="key" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name, item) => (valueFormatter ? valueFormatter(value, name, item) : value)}
            contentStyle={{ borderRadius: 10, borderColor: "#ddccA0", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// Line chart — for a value over time (e.g. deposits by month).
export function LineChartCard({ title, subtitle, data, color = CHART_COLORS[0], valueFormatter, height = 220 }) {
  const rows = data || [];
  return (
    <ChartShell title={title} subtitle={subtitle} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#efe6cf" vertical={false} />
          <XAxis dataKey="key" tick={{ fontSize: 11, fill: "#4a463c" }} />
          <YAxis tick={{ fontSize: 11, fill: "#4a463c" }} width={44} />
          <Tooltip
            formatter={(value, name, item) => (valueFormatter ? valueFormatter(value, name, item) : value)}
            contentStyle={{ borderRadius: 10, borderColor: "#ddccA0", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
