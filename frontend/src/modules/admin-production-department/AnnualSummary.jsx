const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

// "Just to take note of our development and farming achievements
// annually" — the actual point of this department. Totals both what was
// declared and what Store has actually confirmed/received so far, per
// crop, for a given year.
export default function AnnualSummary({ year, onYearChange, summary }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Annual production summary</p>
        <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {summary.length === 0 ? (
        <p className="mt-3 text-sm text-ink-600">No harvests declared for {year} yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-600">
                <th className="pb-2 pr-3">Crop</th>
                <th className="pb-2 pr-3">Declarations</th>
                <th className="pb-2 pr-3">Total declared</th>
                <th className="pb-2">Confirmed by Store</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.crop} className="border-t border-soil-200">
                  <td className="py-2 pr-3 font-medium text-ink-900">{row.crop}</td>
                  <td className="py-2 pr-3 text-ink-600">{row.declarations}</td>
                  <td className="py-2 pr-3 text-ink-900">
                    {row.totalDeclared} {row.unit}
                  </td>
                  <td className="py-2 text-ink-900">
                    {row.totalReceived} {row.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
