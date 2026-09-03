export default function ROIBreakdown({ records }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">ROI by year</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-600">
              <th className="pb-2 pr-4">Year</th>
              <th className="pb-2 pr-4">ROI</th>
              <th className="pb-2 pr-4">Penalty</th>
              <th className="pb-2 pr-4">Net payout</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.year} className="border-t border-soil-200">
                <td className="py-2 pr-4 text-ink-900">Year {r.year}</td>
                <td className="py-2 pr-4 text-ink-600">{r.roiPercent}%</td>
                <td className="py-2 pr-4 text-ink-600">
                  {r.penaltyPercent > 0 ? `-${r.penaltyPercent}%` : "—"}
                </td>
                <td className="py-2 pr-4 text-ink-900">₦{r.netPayout.toLocaleString()}</td>
                <td className="py-2">
                  {r.adminApproved ? (
                    <span className="text-xs text-canopy-800">Paid out</span>
                  ) : (
                    <span className="text-xs text-harvest-600">Awaiting Finance approval</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
