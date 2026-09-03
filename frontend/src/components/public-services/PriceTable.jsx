// Generic styled price table, same visual pattern as ROITable but for
// crop/unit/price rows rather than year/ROI. Used by the Produce Sourcing
// room; reusable anywhere a simple priced-list needs the same treatment.

export default function PriceTable({ rows, theme }) {
  return (
    <div className="overflow-hidden rounded-card border border-soil-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ background: theme.heroFrom }}>
            <th className="px-5 py-3 font-medium text-white">Crop</th>
            <th className="px-5 py-3 font-medium text-white">Unit</th>
            <th className="px-5 py-3 font-medium text-white">Standard price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.crop} className={i % 2 === 0 ? "bg-white" : "bg-soil-50"}>
              <td className="px-5 py-3 text-ink-900">{r.crop}</td>
              <td className="px-5 py-3 text-ink-600">{r.unit}</td>
              <td className="px-5 py-3 font-display text-lg font-semibold text-canopy-800">{r.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
