import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Sprout, ClipboardList, BarChart3, FileCheck2, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { departmentRoleLabel } from "../../utils/departmentRole.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DeptDashboardCards from "../../components/DeptDashboardCards.jsx";
import DepartmentRequestsPanel from "../../components/DepartmentRequestsPanel.jsx";
import FarmList from "./FarmList.jsx";
import HarvestLog from "./HarvestLog.jsx";
import AnnualSummary from "./AnnualSummary.jsx";

const CURRENT_YEAR = new Date().getFullYear();

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "farms", label: "Farms", icon: Sprout },
  { key: "harvests", label: "Harvests", icon: ClipboardList },
  { key: "summary", label: "Annual summary", icon: BarChart3 },
  { key: "requests", label: "Requests", icon: FileCheck2 },
  { key: "profile", label: "Profile", icon: User },
];

export default function ProductionDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [farms, setFarms] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [summary, setSummary] = useState([]);
  const [declarations, setDeclarations] = useState([]);
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
      const [{ summary: s }, { declarations: d }] = await Promise.all([
        apiFetch(`/production/summary?year=${y}`),
        apiFetch(`/production/declarations?year=${y}`),
      ]);
      setSummary(s);
      setDeclarations(d);
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

  async function handleDeclareAnnual(body) {
    await apiFetch("/production/declarations", { method: "POST", body });
    await loadSummary(year);
  }

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab} exitTo="/admin">
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
              Company-owned farms and Ephaag's own annual harvest record.
            </p>
          </div>
          <DeptDashboardCards
            endpoint="/production/dashboard"
            onNavigate={setTab}
            buildCards={(d) => [
              { label: "Active farms", value: d.activeFarms, nav: "farms" },
              { label: "Fallow farms", value: d.fallowFarms, nav: "farms" },
              {
                label: "Harvests this year",
                value: d.harvestsThisYear,
                hint: `${d.distinctCropsThisYear} distinct crops`,
                nav: "harvests",
              },
              {
                label: "Awaiting Store receipt",
                value: d.awaitingStoreReceipt,
                hint: "Declared, not yet confirmed",
                nav: "harvests",
              },
            ]}
          />
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
          <AnnualSummary
            year={year}
            onYearChange={setYear}
            summary={summary}
            declarations={declarations}
            onDeclareAnnual={handleDeclareAnnual}
          />
        </div>
      )}

      {tab === "requests" && <DepartmentRequestsPanel department="Production" />}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Production</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: departmentRoleLabel(user, "Production") }]} />
        </div>
      )}
    </DashboardShell>
  );
}
