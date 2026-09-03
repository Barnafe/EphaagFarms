import { useState } from "react";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import AssetList from "./AssetList.jsx";
import { assets as initialAssets } from "./mockData.js";

export default function MaintenanceDepartment() {
  const [assets, setAssets] = useState(initialAssets);

  function handleLogService(assetId) {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? { ...a, status: "good", lastServiced: new Date().toISOString().slice(0, 10) }
          : a
      )
    );
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">Maintenance Department</h1>
        <p className="mt-1 text-sm text-canopy-100">Vehicle and equipment upkeep.</p>
      </div>

      <AssetList assets={assets} onLogService={handleLogService} />
    </div>
    </AdminDashboardShell>
  );
}
