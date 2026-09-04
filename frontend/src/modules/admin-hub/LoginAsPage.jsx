import { useNavigate } from "react-router-dom";
import { Sprout, ShoppingCart, Truck, Warehouse, Landmark, Wrench, GraduationCap, LogIn } from "lucide-react";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import { useActingAs } from "../../context/ActingAsContext.jsx";

// The 7 positions a real hire would eventually fill (kept in sync with
// DEPARTMENTS in backend/src/controllers/adminPositionsController.js — the
// same list used for HOD appointment). Every one of these routes is already
// gated by role_type='admin' alone, so there's nothing to authenticate —
// clicking straight-up takes the admin into that department's real,
// fully-working screen with every control active, same as if that
// department's head were logged in themselves.
const departments = [
  { key: "Production", to: "/admin/production", desc: "Company-owned farms and harvest output.", icon: Sprout },
  { key: "Procurement", to: "/admin/procurement", desc: "Source orders, assign processors, standardized prices.", icon: ShoppingCart },
  { key: "Transport", to: "/admin/transport", desc: "Assign drivers, generate shipment documents.", icon: Truck },
  { key: "Store", to: "/admin/store", desc: "Inventory, receiving, allocation, restock requests.", icon: Warehouse },
  { key: "Finance", to: "/admin/finance", desc: "Payments, the loan pipeline, settlements.", icon: Landmark },
  { key: "Maintenance", to: "/admin/maintenance", desc: "Vehicle and equipment upkeep.", icon: Wrench },
  { key: "Seminal", to: "/admin/seminal", desc: "Upload and approve farmer training courses.", icon: GraduationCap },
];

export default function LoginAsPage() {
  const navigate = useNavigate();
  const { setActingAs } = useActingAs();

  function handleLoginAs(dept) {
    setActingAs(dept.key);
    navigate(dept.to);
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-5xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Login as a department</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Until real staff are hired and appointed, pick a department below to step straight into
            its dashboard — no login details needed, and every control there stays fully active.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => handleLoginAs(d)}
                className="card flex flex-col items-start gap-2 text-left transition hover:border-canopy-400 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-canopy-50 text-canopy-700">
                  <Icon size={20} />
                </span>
                <p className="font-medium text-ink-900">{d.key}</p>
                <p className="text-sm text-ink-600">{d.desc}</p>
                <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-canopy-700">
                  <LogIn size={14} />
                  Login as {d.key}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
