import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AllocationTaskList from "./AllocationTaskList.jsx";

function mapTask(a) {
  return {
    id: a.id,
    orderReference: a.reference,
    status: a.status,
    items: a.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: a.delivery_location,
  };
}

export default function StoreRoom() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const { allocations } = await apiFetch("/store/allocations/me");
      setTasks(allocations.map(mapTask));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleConfirm(taskId) {
    try {
      await apiFetch(`/store/allocations/${taskId}/confirm`, { method: "POST" });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-600">Module 8</p>
        <h1 className="text-xl font-medium text-ink-900">Store Room</h1>
        <p className="mt-1 text-sm text-ink-600">
          Orders allocated to you by the Store Department.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-600">Loading…</p>
      ) : (
        <AllocationTaskList tasks={tasks} onConfirm={handleConfirm} />
      )}
    </div>
  );
}
