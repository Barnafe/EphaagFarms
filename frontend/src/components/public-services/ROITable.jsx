export default function ROITable({ rows, theme }) {
  return (
    <div className="overflow-hidden rounded-card border border-soil-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ background: theme.heroFrom }}>
            <th className="px-5 py-3 font-medium text-white">Year</th>
            <th className="px-5 py-3 font-medium text-white">Return on investment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.year} className={i % 2 === 0 ? "bg-white" : "bg-soil-50"}>
              <td className="px-5 py-3 text-ink-900">{r.year}</td>
              <td className="px-5 py-3 font-display text-lg font-semibold text-canopy-800">{r.roi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
