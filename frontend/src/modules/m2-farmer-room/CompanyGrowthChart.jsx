import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function CompanyGrowthChart() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/farmers/company-growth")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return null;
  if (!data) return <p className="text-sm text-canopy-100">Loading…</p>;
  if (data.months.length === 0) {
    return <p className="text-sm text-canopy-100">Not enough data yet to show growth.</p>;
  }

  const width = 560;
  const height = 220;
  const padding = 32;
  const barGap = 8;
  const maxValue = Math.max(...data.months.map((m) => m.totalFarmers), 1);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.months.length - barGap;

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Farmers joining EPHAAG, month by month</p>
      <p className="mt-1 text-2xl font-medium text-canopy-800">{data.totalFarmers.toLocaleString()} farmers</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full" role="img" aria-label="Farmer growth chart">
        {data.months.map((m, i) => {
          const barHeight = (m.totalFarmers / maxValue) * chartHeight;
          const x = padding + i * (barWidth + barGap);
          const y = height - padding - barHeight;
          const label = new Date(m.month).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
          return (
            <g key={m.month}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill="#2c6b2f" />
              <text x={x + barWidth / 2} y={height - padding + 14} textAnchor="middle" fontSize="9" fill="#6b6257">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
