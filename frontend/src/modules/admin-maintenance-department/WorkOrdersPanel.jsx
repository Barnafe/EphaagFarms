import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const statusStyles = {
  open: "bg-harvest-100 text-harvest-800",
  assigned: "bg-harvest-100 text-harvest-800",
  diagnosis: "bg-clay-100 text-clay-700",
  in_progress: "bg-clay-100 text-clay-700",
  awaiting_parts: "bg-clay-100 text-clay-700",
  testing: "bg-canopy-50 text-canopy-800",
  completed: "bg-soil-100 text-ink-600",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_STEPS = ["open", "assigned", "diagnosis", "in_progress", "awaiting_parts", "testing"];

const emptyForm = { title: "", description: "", assetId: "", priority: "medium", scheduledDate: "" };

function WorkOrderDetail({ order, technicians, contractors, parts, onChanged, onError }) {
  const [assignForm, setAssignForm] = useState({ type: "technician", id: "" });
  const [diagnosis, setDiagnosis] = useState(order.diagnosis || "");
  const [partForm, setPartForm] = useState({ partId: "", quantity: "" });
  const [inspectionForm, setInspectionForm] = useState({ inspectionType: "post_repair", result: "pass", notes: "" });
  const [completeForm, setCompleteForm] = useState({ workPerformed: "", laborCost: "", laborDescription: "Labor" });
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleAssign(e) {
    e.preventDefault();
    if (!assignForm.id) return;
    run(() =>
      apiFetch(`/maintenance/work-orders/${order.id}/assign`, {
        method: "POST",
        body:
          assignForm.type === "technician"
            ? { technicianId: assignForm.id }
            : { contractorId: assignForm.id },
      })
    );
  }

  function handleDiagnosis(e) {
    e.preventDefault();
    if (!diagnosis.trim()) return;
    run(() => apiFetch(`/maintenance/work-orders/${order.id}/diagnosis`, { method: "POST", body: { diagnosis } }));
  }

  function handleStatus(status) {
    run(() => apiFetch(`/maintenance/work-orders/${order.id}/status`, { method: "PATCH", body: { status } }));
  }

  function handleAddPart(e) {
    e.preventDefault();
    if (!partForm.partId || !partForm.quantity) return;
    run(() =>
      apiFetch(`/maintenance/work-orders/${order.id}/parts`, {
        method: "POST",
        body: { partId: partForm.partId, quantity: Number(partForm.quantity) },
      })
    ).then(() => setPartForm({ partId: "", quantity: "" }));
  }

  function handleInspection(e) {
    e.preventDefault();
    run(() => apiFetch(`/maintenance/work-orders/${order.id}/inspections`, { method: "POST", body: inspectionForm }));
  }

  function handleComplete(e) {
    e.preventDefault();
    run(() =>
      apiFetch(`/maintenance/work-orders/${order.id}/complete`, {
        method: "POST",
        body: {
          workPerformed: completeForm.workPerformed,
          laborCost: completeForm.laborCost ? Number(completeForm.laborCost) : null,
          laborDescription: completeForm.laborDescription,
        },
      })
    );
  }

  const isDone = order.status === "completed" || order.status === "cancelled";

  return (
    <div className="mt-3 space-y-3 rounded-card border border-soil-200 bg-soil-50 p-3">
      {order.description && <p className="text-sm text-ink-700">{order.description}</p>}

      {!isDone && (
        <>
          {/* Step: Technician assigned */}
          <form onSubmit={handleAssign} className="field flex flex-wrap items-end gap-2">
            <div>
              <label>Assign to</label>
              <select value={assignForm.type} onChange={(e) => setAssignForm({ type: e.target.value, id: "" })}>
                <option value="technician">Technician</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div>
              <label>Who</label>
              <select value={assignForm.id} onChange={(e) => setAssignForm({ ...assignForm, id: e.target.value })}>
                <option value="">Select…</option>
                {(assignForm.type === "technician" ? technicians : contractors).map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.company_name}</option>
                ))}
              </select>
            </div>
            <button className="btn-outline" type="submit" disabled={busy}>Assign</button>
          </form>
          {(order.technician_name || order.contractor_name) && (
            <p className="text-xs text-ink-600">Currently assigned: {order.technician_name || order.contractor_name}</p>
          )}

          {/* Step: Diagnosis */}
          <form onSubmit={handleDiagnosis} className="field flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label>Diagnosis</label>
              <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="What's the finding?" />
            </div>
            <button className="btn-outline" type="submit" disabled={busy}>Save diagnosis</button>
          </form>

          {/* Status progression */}
          <div className="flex flex-wrap gap-1">
            {STATUS_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || s === order.status}
                onClick={() => handleStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  s === order.status ? "bg-clay-700 text-white" : "border border-soil-200 text-ink-700 hover:border-clay-600"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStatus("cancelled")}
              className="rounded-full border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:border-red-400"
            >
              cancel
            </button>
          </div>

          {/* Step: Repair / Parts Used */}
          <form onSubmit={handleAddPart} className="field flex flex-wrap items-end gap-2">
            <div>
              <label>Part used</label>
              <select value={partForm.partId} onChange={(e) => setPartForm({ ...partForm, partId: e.target.value })}>
                <option value="">Select part…</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({Number(p.quantity_on_hand)} {p.unit} in stock)</option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity</label>
              <input type="number" min="1" value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} />
            </div>
            <button className="btn-outline" type="submit" disabled={busy}>Log part used</button>
          </form>
          {order.parts?.length > 0 && (
            <ul className="text-xs text-ink-600">
              {order.parts.map((p) => (
                <li key={p.id}>{p.part_name} × {Number(p.quantity)}</li>
              ))}
            </ul>
          )}

          {/* Step: Inspection / Testing */}
          <form onSubmit={handleInspection} className="field flex flex-wrap items-end gap-2">
            <div>
              <label>Inspection type</label>
              <select value={inspectionForm.inspectionType} onChange={(e) => setInspectionForm({ ...inspectionForm, inspectionType: e.target.value })}>
                <option value="pre_repair">Pre-repair</option>
                <option value="post_repair">Post-repair</option>
                <option value="routine">Routine</option>
                <option value="safety">Safety</option>
              </select>
            </div>
            <div>
              <label>Result</label>
              <select value={inspectionForm.result} onChange={(e) => setInspectionForm({ ...inspectionForm, result: e.target.value })}>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="needs_attention">Needs attention</option>
              </select>
            </div>
            <div className="flex-1">
              <label>Notes</label>
              <input value={inspectionForm.notes} onChange={(e) => setInspectionForm({ ...inspectionForm, notes: e.target.value })} />
            </div>
            <button className="btn-outline" type="submit" disabled={busy}>Log inspection</button>
          </form>
          {order.inspections?.length > 0 && (
            <ul className="text-xs text-ink-600">
              {order.inspections.map((i) => (
                <li key={i.id}>{i.inspection_type.replace("_", " ")}: {i.result.replace("_", " ")}</li>
              ))}
            </ul>
          )}

          {/* Step: Work Completed + Cost Recorded */}
          <form onSubmit={handleComplete} className="field grid gap-2 rounded-card border border-canopy-400/40 p-2 sm:grid-cols-4">
            <textarea
              className="sm:col-span-4"
              value={completeForm.workPerformed}
              onChange={(e) => setCompleteForm({ ...completeForm, workPerformed: e.target.value })}
              placeholder="Work performed summary"
              rows={2}
            />
            <input
              type="number"
              min="0"
              value={completeForm.laborCost}
              onChange={(e) => setCompleteForm({ ...completeForm, laborCost: e.target.value })}
              placeholder="Labor cost (₦, optional)"
            />
            <input
              className="sm:col-span-2"
              value={completeForm.laborDescription}
              onChange={(e) => setCompleteForm({ ...completeForm, laborDescription: e.target.value })}
              placeholder="Labor description"
            />
            <button className="btn-primary" type="submit" disabled={busy}>Mark completed</button>
          </form>
        </>
      )}

      {isDone && (
        <div className="text-sm text-ink-700">
          {order.work_performed && <p>Work performed: {order.work_performed}</p>}
          {order.diagnosis && <p>Diagnosis: {order.diagnosis}</p>}
        </div>
      )}
    </div>
  );
}

export default function WorkOrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [parts, setParts] = useState([]);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ workOrders }, { assets }, { technicians }, { contractors }, { parts }] = await Promise.all([
        apiFetch("/maintenance/work-orders"),
        apiFetch("/maintenance/assets"),
        apiFetch("/maintenance/technicians"),
        apiFetch("/maintenance/contractors"),
        apiFetch("/maintenance/parts"),
      ]);
      setOrders(workOrders);
      setAssets(assets);
      setTechnicians(technicians.filter((t) => t.status === "active"));
      setContractors(contractors.filter((c) => c.status === "active"));
      setParts(parts);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/work-orders", { method: "POST", body: { ...form, assetId: form.assetId || null } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Diagnosis, repairs, parts used, inspection, and sign-off</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New work order</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input className="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Work order title" required />
          <textarea className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} />
          <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
            <option value="">No specific asset</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create work order"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {orders.length === 0 && <p className="text-sm text-ink-600">No work orders yet.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-card border border-soil-200 px-3 py-2">
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
              <div>
                <p className="font-medium text-ink-900">{o.title}</p>
                <p className="text-xs text-ink-600">
                  {o.reference} · {o.asset_name || "No asset"} · {o.priority} · {o.source}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[o.status]}`}>{o.status.replace("_", " ")}</span>
            </button>
            {expanded === o.id && (
              <WorkOrderDetail
                order={o}
                technicians={technicians}
                contractors={contractors}
                parts={parts}
                onChanged={load}
                onError={setError}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
