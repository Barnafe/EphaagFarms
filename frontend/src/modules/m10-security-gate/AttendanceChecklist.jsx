import { useState } from "react";

export default function AttendanceChecklist({ members, seminarTitle, sheetFileName, onSubmit, onBack }) {
  const [attended, setAttended] = useState({});

  function toggle(id) {
    setAttended((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSubmit() {
    const attendedIds = Object.keys(attended).filter((id) => attended[id]);
    onSubmit(attendedIds);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Mark attendance — <span className="font-medium text-ink-900">{seminarTitle}</span>
      </p>
      <p className="mt-1 text-xs text-ink-600">
        Sheet on file: {sheetFileName}. Check anyone who attended — everyone else is recorded absent.
      </p>

      <div className="mt-4 space-y-1">
        {members.map((m) => (
          <label
            key={m.id}
            className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm"
          >
            <span className="text-ink-900">{m.name}</span>
            <input type="checkbox" checked={!!attended[m.id]} onChange={() => toggle(m.id)} />
          </label>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button className="btn-primary" type="button" onClick={handleSubmit}>
          Submit attendance
        </button>
        <button className="btn-outline" type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
