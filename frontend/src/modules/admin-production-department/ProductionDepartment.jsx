import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import FarmList from "./FarmList.jsx";
import HarvestLog from "./HarvestLog.jsx";
import AnnualSummary from "./AnnualSummary.jsx";

const CURRENT_YEAR = new Date().getFullYear();

export default function ProductionDepartment() {
  const [farms, setFarms] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [summary, setSummary] = useState([]);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [error, setError] = useState(null);

  const loadFarmsAndHarvests = useCallback(async () => {
    try {
      const [{ farms: f }, { harvests: h }] = await Promise.all([
        apiFetch("/production/farms"),
        apiFetch("/production/harvests"),
      ]);
      setFarms(f);
      setHarvests(h);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadSummary = useCallback(async (y) => {
    try {
      const { summary: s } = await apiFetch(`/production/summary?year=${y}`);
      setSummary(s);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadFarmsAndHarvests();
  }, [loadFarmsAndHarvests]);

  useEffect(() => {
    loadSummary(year);
  }, [loadSummary, year]);

  async function handleCreateFarm(body) {
    await apiFetch("/production/farms", { method: "POST", body });
    await loadFarmsAndHarvests();
  }

  async function handleUpdateFarm(id, body) {
    await apiFetch(`/production/farms/${id}`, { method: "PATCH", body });
    await loadFarmsAndHarvests();
  }

  async function handleDeleteFarm(id) {
    await apiFetch(`/production/farms/${id}`, { method: "DELETE" });
    await loadFarmsAndHarvests();
  }

  async function handleDeclareHarvest(body) {
    await apiFetch("/production/harvests", { method: "POST", body });
    await Promise.all([loadFarmsAndHarvests(), loadSummary(year)]);
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
          <h1 className="text-xl font-medium text-white">Production Department</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Company-owned farms and Ephaag's own annual harvest record. Declared harvests are
            confirmed and added to inventory separately by Store Department.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <FarmList farms={farms} onCreate={handleCreateFarm} onUpdate={handleUpdateFarm} onDelete={handleDeleteFarm} />
        <HarvestLog farms={farms} harvests={harvests} onDeclare={handleDeclareHarvest} />
        <AnnualSummary year={year} onYearChange={setYear} summary={summary} />
      </div>
    </AdminDashboardShell>
  );
}
