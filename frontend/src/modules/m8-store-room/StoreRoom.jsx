import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, PackageCheck, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
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

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tasks", label: "Tasks", icon: PackageCheck },
  { key: "profile", label: "Profile", icon: User },
];

export default function StoreRoom() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
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

  if (!user) return null;

  const pendingCount = tasks.filter((t) => t.status === "assigned").length;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-medium text-white">Welcome, {user.name}</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Orders allocated to you by the Store Department.
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Tasks pending</p>
            <p className="text-lg font-medium text-canopy-800">{loading ? "…" : pendingCount}</p>
          </div>
        </div>
      )}

      {tab === "tasks" &&
        (loading ? (
          <p className="text-sm text-canopy-100">Loading…</p>
        ) : (
          <AllocationTaskList tasks={tasks} onConfirm={handleConfirm} />
        ))}

      {tab === "profile" && <AccountProfileCard user={user} />}
    </DashboardShell>
  );
}
