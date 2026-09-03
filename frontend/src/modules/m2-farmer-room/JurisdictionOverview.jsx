export default function JurisdictionOverview({ farmers, rank }) {
  if (rank === "Member") return null;

  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Jurisdiction overview <span className="text-xs">(unlocked at {rank})</span>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-600">
              <th className="pb-2 pr-4">Farmer</th>
              <th className="pb-2 pr-4">Unit</th>
              <th className="pb-2">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {farmers.map((f) => (
              <tr key={f.id} className="border-t border-soil-200">
                <td className="py-2 pr-4 text-ink-900">{f.name}</td>
                <td className="py-2 pr-4 text-ink-600">{f.unit}</td>
                <td className="py-2 text-ink-600">{f.attendancePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
