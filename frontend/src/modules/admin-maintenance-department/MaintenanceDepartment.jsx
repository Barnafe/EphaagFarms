import { useState } from "react";
import { LayoutDashboard, User, Wrench, CalendarClock } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DashboardPanel from "./DashboardPanel.jsx";
import MaintenanceWorkspace from "./MaintenanceWorkspace.jsx";
import PreventiveMaintenance from "./PreventiveMaintenance.jsx";

// The Maintenance HOD's own portal — deliberately its own DashboardShell
// (own hamburger, own constant menu) rather than nested inside
// AdminDashboardShell's generic admin sidebar, same pattern every member
// room uses (see FarmerRoom.jsx). Preventive Maintenance is kept as its
// own top-level item, separate from "Maintenance" (the reactive
// request -> work order pipeline), per the 2026-09-04 spec.
const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Profile", icon: User },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "preventive", label: "Preventive Maintenance", icon: CalendarClock },
];

export default function MaintenanceDepartment() {
  const { session } = useAuth();
  const user = session?.user;
  const [tab, setTab] = useState("dashboard");

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      <ActingAsBanner />
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
            <h1 className="text-xl font-medium text-white">Maintenance Department</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Welcome back, {user.name}. Requests, work orders, assets, and everything else the
              department runs on.
            </p>
          </div>
          <DashboardPanel onNavigate={setTab} />
        </div>
      )}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Maintenance</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: "Maintenance HOD" }]} />
        </div>
      )}

      {tab === "maintenance" && <MaintenanceWorkspace />}

      {tab === "preventive" && <PreventiveMaintenance />}
    </DashboardShell>
  );
}
