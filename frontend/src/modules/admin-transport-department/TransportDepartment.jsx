import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Truck, Route, Car, Fuel, FileCheck2, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { departmentRoleLabel } from "../../utils/departmentRole.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DeptDashboardCards from "../../components/DeptDashboardCards.jsx";
import DepartmentRequestsPanel from "../../components/DepartmentRequestsPanel.jsx";
import DispatchPanel from "./DispatchPanel.jsx";
import TripsPanel from "./TripsPanel.jsx";
import FleetPanel from "./FleetPanel.jsx";
import CostsPanel from "./CostsPanel.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "dispatch", label: "Dispatch", icon: Truck },
  { key: "trips", label: "Trips", icon: Route },
  { key: "fleet", label: "Fleet", icon: Car },
  { key: "costs", label: "Costs", icon: Fuel },
  { key: "requests", label: "Requests", icon: FileCheck2 },
  { key: "profile", label: "Profile", icon: User },
];

export default function TransportDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useUrlState("tab", "dashboard");
  const [dispatchQueue, setDispatchQueue] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [{ orders }, { drivers: dir }, { vehicles: fleet }] = await Promise.all([
        apiFetch("/transport/queue"),
        apiFetch("/transport/drivers"),
        apiFetch("/transport/vehicles"),
      ]);
      setDispatchQueue(orders);
      setDrivers(dir);
      setVehicles(fleet);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleCreateTrip(body) {
    try {
      await apiFetch("/transport/trips", { method: "POST", body });
      await loadAll();
      setTab("trips");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab} exitTo="/admin">
      <ActingAsBanner />

      {tab === "dashboard" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
            <h1 className="text-xl font-medium text-white">Transport Department</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Plans trips with a vehicle and a driver, tracks every delivery and keeps the fleet running. Use
              the sidebar to open Dispatch.
            </p>
          </div>

          {error && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <DeptDashboardCards
            endpoint="/transport/dashboard"
            onNavigate={setTab}
            buildCards={(d) => [
              { label: "Ready to dispatch", value: d.readyToDispatch, nav: "dispatch" },
              { label: "En route", value: d.enRoute },
              { label: "Delivered (total)", value: d.deliveredTotal },
              { label: "Registered drivers", value: d.registeredDrivers },
              { label: "Vehicles free", value: d.vehiclesAvailable, nav: "fleet" },
              { label: "In maintenance", value: d.vehiclesInMaintenance, nav: "fleet" },
              { label: "Broken down trips", value: d.brokenDownTrips, nav: "trips" },
              { label: "Costs waiting for Finance", value: d.costsWaitingForFinance, nav: "costs" },
            ]}
          />
        </div>
      )}

      {tab === "dispatch" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Transport Department</p>
            <h1 className="text-xl font-medium text-white">Dispatch</h1>
          </div>

          {error && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <DispatchPanel orders={dispatchQueue} vehicles={vehicles} drivers={drivers} onCreate={handleCreateTrip} />
        </div>
      )}

      {tab === "trips" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Transport Department</p>
            <h1 className="text-xl font-medium text-white">Trips</h1>
          </div>
          <TripsPanel vehicles={vehicles} drivers={drivers} onChanged={loadAll} />
        </div>
      )}

      {tab === "fleet" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Transport Department</p>
            <h1 className="text-xl font-medium text-white">Fleet</h1>
          </div>
          <FleetPanel vehicles={vehicles} drivers={drivers} onChanged={loadAll} />
        </div>
      )}

      {tab === "costs" && (
        <div className="max-w-3xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Transport Department</p>
            <h1 className="text-xl font-medium text-white">Fuel and costs</h1>
          </div>
          <CostsPanel vehicles={vehicles} />
        </div>
      )}

      {tab === "requests" && <DepartmentRequestsPanel department="Transport" />}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Transport</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: departmentRoleLabel(user, "Transport") }]} />
        </div>
      )}
    </DashboardShell>
  );
}
