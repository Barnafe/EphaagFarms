import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import JobList from "./JobList.jsx";

// "Processing jobs" tab of the Buyers/Processor profile. There is no separate
// processor profile any more: Procurement assigns processing jobs to
// Buyers/Processor accounts, and the account works them here (Start
// processing -> Mark complete), after which Store can receive the goods.
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

export default function ProcessingJobs() {
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

  const inProgress = jobs.filter((j) => j.status !== "complete").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-white">Processing jobs</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Orders Procurement has assigned to you for processing. Every order is processed before it moves on to transport.
        </p>
        {!loading && <p className="mt-1 text-xs text-canopy-100">{inProgress} in progress</p>}
      </div>
      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {loading ? <p className="text-sm text-canopy-100">Loading…</p> : <JobList jobs={jobs} onAdvance={handleAdvance} />}
    </div>
  );
}
