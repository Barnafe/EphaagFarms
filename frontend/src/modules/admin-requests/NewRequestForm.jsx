import { useState } from "react";

const DEPARTMENTS = [
  "Transportation",
  "Procurement",
  "Finance",
  "Maintenance",
  "Store",
  "Production",
  "TRC",
  "Other",
];

export default function NewRequestForm({ adminUsers, onSubmit }) {
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [approvers, setApprovers] = useState([]);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function addApprover() {
    setApprovers((prev) => [...prev, { label: "", approverId: adminUsers[0]?.id || "" }]);
  }
  function updateApprover(i, field, value) {
    setApprovers((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));
  }
  function removeApprover(i) {
    setApprovers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    try {
      await onSubmit({ department, title, description, approvers, file });
      setTitle("");
      setDescription("");
      setApprovers([]);
      setFile(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-4">
      <p className="text-sm text-ink-600">New request</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label>Department raising this</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Fuel purchase for delivery van" />
        </div>
      </div>

      <div>
        <label>Description</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details of what's being requested and why"
        />
      </div>

      <div>
        <p className="text-sm text-ink-600">Approval chain</p>
        <p className="mt-1 text-xs text-ink-600">
          Add whoever needs to approve, in order — e.g. Finance Head, then Transport Head. Admin final
          approval is always added automatically as the last step.
        </p>
        <div className="mt-3 space-y-2">
          {approvers.map((a, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1"
                value={a.label}
                onChange={(e) => updateApprover(i, "label", e.target.value)}
                placeholder={`Step ${i + 1} label, e.g. "Finance Head approval"`}
              />
              <select
                className="flex-1"
                value={a.approverId}
                onChange={(e) => updateApprover(i, "approverId", e.target.value)}
              >
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button type="button" className="btn-outline" onClick={() => removeApprover(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline mt-2" onClick={addApprover}>
          Add approver
        </button>
      </div>

      <div>
        <label>Attachment (optional)</label>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>

      <button className="btn-primary" type="submit" disabled={submitting || !title}>
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
