import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Truck, FileCheck2, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { departmentRoleLabel } from "../../utils/departmentRole.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DeptDashboardCards from "../../components/DeptDashboardCards.jsx";
import DepartmentRequestsPanel from "../../components/DepartmentRequestsPanel.jsx";
import DispatchPanel from "./DispatchPanel.jsx";

function mapOrder(o) {
  return {
    id: o.id,
    orderReference: o.reference,
    items: o.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: o.delivery_location,
    driverId: null,
    shipmentReference: null,
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "dispatch", label: "Dispatch", icon: Truck },
  { key: "requests", label: "Requests", icon: FileCheck2 },
  { key: "profile", label: "Profile", icon: User },
];

export default function TransportDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [dispatchQueue, setDispatchQueue] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [{ orders }, { drivers: dir }] = await Promise.all([
        apiFetch("/transport/queue"),
        apiFetch("/transport/drivers"),
      ]);
      setDispatchQueue(orders.map(mapOrder));
      setDrivers(dir.map((d) => ({ ...d, fleetType: "Driver" })));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleAssign(orderId, driverId) {
    try {
      await apiFetch(`/transport/orders/${orderId}/assign-driver`, {
        method: "POST",
        body: { driverId },
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
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
              Assigns drivers and generates shipment documents once goods are ready to move. Use
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

          <DispatchPanel jobs={dispatchQueue} drivers={drivers} onAssign={handleAssign} />
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
