import { useState } from "react";
import {
  ClipboardList,
  Wrench,
  Boxes,
  Users,
  PackageSearch,
  HardHat,
  CalendarDays,
  Receipt,
  ShieldCheck,
  History,
  BarChart3,
} from "lucide-react";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import RequestsPanel from "./RequestsPanel.jsx";
import WorkOrdersPanel from "./WorkOrdersPanel.jsx";
import AssetsPanel from "./AssetsPanel.jsx";
import TechniciansPanel from "./TechniciansPanel.jsx";
import PartsPanel from "./PartsPanel.jsx";
import ContractorsPanel from "./ContractorsPanel.jsx";
import SchedulePanel from "./SchedulePanel.jsx";
import ExpensesPanel from "./ExpensesPanel.jsx";
import InspectionsPanel from "./InspectionsPanel.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import ReportsPanel from "./ReportsPanel.jsx";

// The core reactive workflow lives here: Employee reports a problem ->
// Maintenance Request -> Supervisor reviews -> Work Order created ->
// Technician assigned -> Diagnosis -> Repair/Parts Used -> Inspection/
// Testing -> Work Completed -> Cost Recorded -> Maintenance History.
// Preventive Maintenance is deliberately NOT one of these sections — it's
// its own top-level tab (see PreventiveMaintenance.jsx).
const sections = [
  { key: "requests", label: "Maintenance Requests", icon: ClipboardList, description: "Reported problems awaiting review." },
  { key: "work-orders", label: "Work Orders", icon: Wrench, description: "Diagnosis, repair, and sign-off in one place." },
  { key: "assets", label: "Assets & Equipment", icon: Boxes, description: "Everything the department maintains." },
  { key: "technicians", label: "Technicians", icon: Users, description: "In-house staff and their workload." },
  { key: "parts", label: "Spare Parts & Inventory", icon: PackageSearch, description: "Stock levels and usage." },
  { key: "contractors", label: "Contractors", icon: HardHat, description: "External service providers." },
  { key: "schedule", label: "Maintenance Schedule", icon: CalendarDays, description: "Everything with a scheduled date." },
  { key: "expenses", label: "Expenses", icon: Receipt, description: "Every cost recorded against a work order." },
  { key: "inspections", label: "Inspections", icon: ShieldCheck, description: "Routine, safety, and post-repair checks." },
  { key: "history", label: "Maintenance History", icon: History, description: "Completed work, with full cost." },
  { key: "reports", label: "Reports", icon: BarChart3, description: "Spend, load, and turnaround at a glance." },
];

export default function MaintenanceWorkspace() {
  const [section, setSection] = useState(null);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Maintenance</p>
        <h1 className="text-xl font-medium text-white">Maintenance</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Report → review → work order → technician → diagnosis → repair → inspection → complete.
        </p>
      </div>

      <DeptSectionNav sections={sections} activeKey={section} onSelect={setSection} deptLabel="maintenance sections" />

      {section === "requests" && <RequestsPanel />}
      {section === "work-orders" && <WorkOrdersPanel />}
      {section === "assets" && <AssetsPanel />}
      {section === "technicians" && <TechniciansPanel />}
      {section === "parts" && <PartsPanel />}
      {section === "contractors" && <ContractorsPanel />}
      {section === "schedule" && <SchedulePanel />}
      {section === "expenses" && <ExpensesPanel />}
      {section === "inspections" && <InspectionsPanel />}
      {section === "history" && <HistoryPanel />}
      {section === "reports" && <ReportsPanel />}
    </div>
  );
}
