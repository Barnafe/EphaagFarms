import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Sprout, ClipboardList, BarChart3, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import FarmList from "./FarmList.jsx";
import HarvestLog from "./HarvestLog.jsx";
import AnnualSummary from "./AnnualSummary.jsx";

const CURRENT_YEAR = new Date().getFullYear();

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "farms", label: "Farms", icon: Sprout },
  { key: "harvests", label: "Harvests", icon: ClipboardList },
  { key: "summary", label: "Annual summary", icon: BarChart3 },
  { key: "profile", label: "Profile", icon: User },
];

export default function ProductionDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
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

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      <ActingAsBanner />

      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
            <h1 className="text-xl font-medium text-white">Production Department</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Company-owned farms and Ephaag's own annual harvest record. Declared harvests are
              confirmed and added to inventory separately by Store Department.
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Company farms</p>
            <p className="text-lg font-medium text-canopy-800">{farms.length}</p>
          </div>
        </div>
      )}

      {tab === "farms" && (
        <div className="max-w-3xl">
          <FarmList farms={farms} onCreate={handleCreateFarm} onUpdate={handleUpdateFarm} onDelete={handleDeleteFarm} />
        </div>
      )}

      {tab === "harvests" && (
        <div className="max-w-3xl">
          <HarvestLog farms={farms} harvests={harvests} onDeclare={handleDeclareHarvest} />
        </div>
      )}

      {tab === "summary" && (
        <div className="max-w-3xl">
          <AnnualSummary year={year} onYearChange={setYear} summary={summary} />
        </div>
      )}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Production</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: "Production HOD" }]} />
        </div>
      )}
    </DashboardShell>
  );
}
