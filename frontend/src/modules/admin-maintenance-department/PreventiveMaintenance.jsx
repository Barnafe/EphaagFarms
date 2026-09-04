import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const emptyForm = { assetId: "", taskName: "", frequencyType: "months", frequencyValue: "1", startDate: "", assignedTechnicianId: "" };

export default function PreventiveMaintenance() {
  const [schedules, setSchedules] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  async function load() {
    try {
      const [{ schedules }, { assets }, { technicians }] = await Promise.all([
        apiFetch("/maintenance/schedules"),
        apiFetch("/maintenance/assets"),
        apiFetch("/maintenance/technicians"),
      ]);
      setSchedules(schedules);
      setAssets(assets);
      setTechnicians(technicians.filter((t) => t.status === "active"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.assetId || !form.taskName.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/schedules", {
        method: "POST",
        body: { ...form, frequencyValue: Number(form.frequencyValue), assignedTechnicianId: form.assignedTechnicianId || null, startDate: form.startDate || null },
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePause(s) {
    try {
      await apiFetch(`/maintenance/schedules/${s.id}`, { method: "PATCH", body: { status: s.status === "active" ? "paused" : "active" } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReminderCheck() {
    setBusy(true);
    try {
      const result = await apiFetch("/maintenance/schedules/reminder-check", { method: "POST", body: {} });
      setReminderResult(result);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateWorkOrder(s) {
    try {
      await apiFetch(`/maintenance/schedules/${s.id}/generate-work-order`, { method: "POST", body: {} });
      alert(`Work order created for "${s.task_name}" on ${s.asset_name}. Find it under Maintenance → Work Orders.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Preventive Maintenance</p>
        <h1 className="text-xl font-medium text-white">Preventive Maintenance</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Asset → schedule → due date approaching → automatic reminder → work order → maintenance → next due date.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-600">Recurring schedules, one per asset task</p>
          <div className="flex gap-2">
            <button className="btn-outline" type="button" onClick={handleReminderCheck} disabled={busy}>
              {busy ? "Checking…" : "Run reminder check"}
            </button>
            <button className="btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>+ New schedule</button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {reminderResult && (
          <p className="mt-2 text-xs text-canopy-800">
            Flagged {reminderResult.remindersSent} schedule{reminderResult.remindersSent === 1 ? "" : "s"} due within 7 days.
          </p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-3">
            <select className="sm:col-span-2" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">Select asset…</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={form.assignedTechnicianId} onChange={(e) => setForm({ ...form, assignedTechnicianId: e.target.value })}>
              <option value="">Unassigned</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="sm:col-span-3" value={form.taskName} onChange={(e) => setForm({ ...form, taskName: e.target.value })} placeholder="Task, e.g. Oil change" required />
            <select value={form.frequencyType} onChange={(e) => setForm({ ...form, frequencyType: e.target.value })}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
            <input type="number" min="1" value={form.frequencyValue} onChange={(e) => setForm({ ...form, frequencyValue: e.target.value })} placeholder="Every N" />
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} placeholder="First due date" />
            <div className="flex gap-2 sm:col-span-3">
              <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create schedule"}</button>
              <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {schedules.length === 0 && <p className="text-sm text-ink-600">No preventive schedules set up yet.</p>}
          {schedules.map((s) => (
            <div key={s.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{s.task_name}</p>
                  <p className="text-xs text-ink-600">
                    {s.asset_name} · every {s.frequency_value} {s.frequency_type} · {s.technician_name || "Unassigned"}
                    {s.last_completed_date ? ` · last done ${s.last_completed_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      s.status === "paused"
                        ? "bg-soil-100 text-ink-600"
                        : s.overdue
                        ? "bg-red-100 text-red-700"
                        : s.due_soon
                        ? "bg-harvest-100 text-harvest-800"
                        : "bg-canopy-50 text-canopy-800"
                    }`}
                  >
                    {s.status === "paused" ? "paused" : s.overdue ? "overdue" : s.due_soon ? "due soon" : "on track"} · next {s.next_due_date}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                {s.status === "active" && (s.due_soon || s.overdue) && (
                  <button className="btn-primary" type="button" onClick={() => handleGenerateWorkOrder(s)}>
                    Generate work order
                  </button>
                )}
                <button className="text-xs text-ink-600 underline" type="button" onClick={() => handleTogglePause(s)}>
                  {s.status === "active" ? "Pause" : "Resume"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
