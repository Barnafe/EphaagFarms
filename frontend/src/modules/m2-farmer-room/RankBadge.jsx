import { ranks } from "./mockData.js";

export default function RankBadge({ rank, onChange }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-ink-600">Your rank</p>
        <p className="text-lg font-medium text-canopy-800">{rank}</p>
      </div>
      <div className="field">
        <label className="!mb-0 text-xs">Demo: view as</label>
        <select value={rank} onChange={(e) => onChange(e.target.value)}>
          {ranks.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
