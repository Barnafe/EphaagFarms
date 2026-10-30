import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, ShoppingCart, Truck, Warehouse, Landmark, Wrench, GraduationCap, LogIn, Users } from "lucide-react";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import { useActingAs } from "../../context/ActingAsContext.jsx";
import SectionDropdown from "../../components/SectionDropdown.jsx";

// The 7 positions a real hire would eventually fill (kept in sync with
// DEPARTMENTS in backend/src/controllers/adminPositionsController.js — the
// same list used for HOD appointment). Every one of these routes is already
// gated by role_type='admin' alone, so there's nothing to authenticate —
// clicking straight-up takes the admin into that department's real,
// fully-working screen with every control active, same as if that
// department's head were logged in themselves.
const departments = [
  { key: "Production", to: "/admin/production", desc: "Company-owned farms and harvest output.", icon: Sprout },
  { key: "Procurement", to: "/admin/procurement", desc: "Source orders, assign processing to buyers, standardized prices.", icon: ShoppingCart },
  { key: "Transport", to: "/admin/transport", desc: "Assign drivers, generate shipment documents.", icon: Truck },
  { key: "Store", to: "/admin/store", desc: "Inventory, receiving, allocation, restock requests.", icon: Warehouse },
  { key: "Finance", to: "/admin/finance", desc: "Payments, the loan pipeline, settlements.", icon: Landmark },
  { key: "Maintenance", to: "/admin/maintenance", desc: "Vehicle and equipment upkeep.", icon: Wrench },
  { key: "TRC", to: "/admin/trc", desc: "Training, Research & Consultancy — courses, research, and consultancy bookings.", icon: GraduationCap },
  // Not one of the 7 HOD-appointed positions (no department_head_of value
  // for this) — Unit Leader is a farmer rank, not a department. Added here
  // anyway (2026-09-06 spec) purely as another "step into this seat"
  // entry point, wired the same way: the backend already treats
  // role_type='admin' as a company-wide Unit Leader bypass on every
  // relevant endpoint (farmerRank.js), this just gives that bypass a
  // real screen.
  { key: "Unit Leader", to: "/admin/unit-leader", desc: "Jurisdiction, attendance, loan review, and creating new units.", icon: Users },
];

export default function LoginAsPage() {
  const navigate = useNavigate();
  const { setActingAs } = useActingAs();
  const [picked, setPicked] = useState("");
  const chosen = departments.find((d) => d.key === picked) || null;

  function handleLoginAs(dept) {
    setActingAs(dept.key, dept.to);
    // replace, not push: this picker screen shouldn't linger in history as
    // an extra back-stop between the department and the admin dashboard —
    // see ActingAsContext.jsx for the back-button guard that takes over
    // from here while acting as a department.
    navigate(dept.to, { replace: true });
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-5xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Login as a department</h1>
          <p className="mt-1 text-sm text-canopy-100">Pick a department to step into its dashboard.</p>
        </div>

        <SectionDropdown
          label="Department"
          placeholder="Select a department…"
          sections={departments.map((d) => ({ key: d.key, label: d.key }))}
          value={picked}
          onSelect={setPicked}
          className="mb-4"
        />

        {chosen && (
          <div className="card flex max-w-xl flex-col items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-canopy-50 text-canopy-700">
              <chosen.icon size={20} />
            </span>
            <p className="font-medium text-ink-900">{chosen.key}</p>
            <p className="text-sm text-ink-600">{chosen.desc}</p>
            <button type="button" onClick={() => handleLoginAs(chosen)} className="btn-primary inline-flex items-center gap-2">
              <LogIn size={16} />
              Login as {chosen.key}
            </button>
          </div>
        )}
      </div>
    </AdminDashboardShell>
  );
}
