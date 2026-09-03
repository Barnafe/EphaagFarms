import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import ResearchManager from "./ResearchManager.jsx";

export default function ResearchPage() {
  const [research, setResearch] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { research: r } = await apiFetch("/rtc/admin/research");
      setResearch(r);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd({ title, summary }) {
    try {
      await apiFetch("/rtc/admin/research", { method: "POST", body: { title, summary } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/admin/trc" className="text-xs text-canopy-300 hover:underline">
          ← TRC Department
        </Link>
        <h1 className="mt-1 text-xl font-medium text-white">Research</h1>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <ResearchManager items={research} onAdd={handleAdd} />
    </div>
    </AdminDashboardShell>
  );
}
