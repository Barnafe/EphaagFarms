import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, ClipboardList, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import JobList from "./JobList.jsx";

function mapJob(j) {
  return {
    id: j.id,
    reference: j.reference,
    status: j.status,
    items: j.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: j.delivery_location,
    assignedDate: (j.assigned_at || "").slice(0, 10),
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Jobs", icon: ClipboardList },
  { key: "profile", label: "Profile", icon: User },
];

export default function ProcessorRoom() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const { jobs: list } = await apiFetch("/processor/jobs/me");
      setJobs(list.map(mapJob));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function handleAdvance(jobId) {
    try {
      await apiFetch(`/processor/jobs/${jobId}/advance`, { method: "POST" });
      await loadJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  const pendingCount = jobs.filter((j) => j.status !== "complete").length;

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
              Every order is processed here before it moves on to transport.
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Jobs in progress</p>
            <p className="text-lg font-medium text-canopy-800">{loading ? "…" : pendingCount}</p>
          </div>
        </div>
      )}

      {tab === "jobs" &&
        (loading ? <p className="text-sm text-canopy-100">Loading…</p> : <JobList jobs={jobs} onAdvance={handleAdvance} />)}

      {tab === "profile" && <AccountProfileCard user={user} />}
    </DashboardShell>
  );
}
