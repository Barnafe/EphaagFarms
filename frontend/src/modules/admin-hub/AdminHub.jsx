import { Link } from "react-router-dom";
import {
  Sprout,
  ShoppingCart,
  Building2,
  Truck,
  Warehouse,
  Landmark,
  Wrench,
  GraduationCap,
  BarChart3,
  ClipboardCheck,
} from "lucide-react";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const departments = [
  {
    to: "/admin/production",
    name: "Production",
    desc: "Company-owned farms and their harvest output.",
    icon: Sprout,
  },
  {
    to: "/admin/procurement",
    name: "Procurement",
    desc: "Source orders from farmers, assign processors, view standardized prices.",
    icon: ShoppingCart,
  },
  {
    to: "/admin/buyers",
    name: "Buyers",
    desc: "Directory of every registered buyer with full registration details.",
    icon: Building2,
  },
  {
    to: "/admin/transport",
    name: "Transport",
    desc: "Assign drivers and generate shipment documents.",
    icon: Truck,
  },
  {
    to: "/admin/store",
    name: "Store",
    desc: "Inventory pool, receiving, stock-audited allocation, restock requests.",
    icon: Warehouse,
  },
  {
    to: "/admin/finance",
    name: "Finance",
    desc: "Payment confirmation, the full loan pipeline, settlements, and prices.",
    icon: Landmark,
  },
  {
    to: "/admin/maintenance",
    name: "Maintenance",
    desc: "Vehicle and equipment upkeep.",
    icon: Wrench,
  },
  {
    to: "/admin/seminal",
    name: "Seminal",
    desc: "Upload and approve training courses for farmers to attend online.",
    icon: GraduationCap,
  },
  {
    to: "/admin/analytics",
    name: "Analytics",
    desc: "Survey demographics, produce declarations, loans, savings, training — plus attendance-marking.",
    icon: BarChart3,
  },
  {
    to: "/admin/requests",
    name: "Requests",
    desc: "Paperless cross-department approval workflow — raise, route, approve, and print any request.",
    icon: ClipboardCheck,
  },
];

export default function AdminHub() {
  return (
    <AdminDashboardShell>
      <div className="max-w-5xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Departments</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Each department runs its own activities; admin oversees all of them from here.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => {
            const Icon = d.icon;
            return (
              <Link
                key={d.to}
                to={d.to}
                className="card flex flex-col items-start gap-2 transition hover:border-canopy-400 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-canopy-50 text-canopy-700">
                  <Icon size={20} />
                </span>
                <p className="font-medium text-ink-900">{d.name}</p>
                <p className="text-sm text-ink-600">{d.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
