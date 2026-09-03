import { useState } from "react";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import FarmList from "./FarmList.jsx";
import HarvestLog from "./HarvestLog.jsx";
import { farms, harvestLog as initialHarvests } from "./mockData.js";

export default function ProductionDepartment() {
  const [harvests, setHarvests] = useState(initialHarvests);

  function handleLog(harvest) {
    setHarvests((prev) => [harvest, ...prev]);
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">Production Department</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Company-owned farms and their harvest output.
        </p>
      </div>

      <FarmList farms={farms} />
      <HarvestLog farms={farms} harvests={harvests} onLog={handleLog} />
    </div>
    </AdminDashboardShell>
  );
}
