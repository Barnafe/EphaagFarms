import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  MessageSquareWarning,
  User,
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  PackagePlus,
  Tag,
  GraduationCap,
  LogIn,
  Mail,
} from "lucide-react";
import DashboardShell from "./DashboardShell.jsx";
import ActingAsBanner from "./ActingAsBanner.jsx";

// key -> route, single source of truth for both the sidebar's active-item
// highlight and where clicking each item navigates to.
const ROUTES = {
  departments: "/admin",
  addCatalog: "/admin/add-catalog",
  addPrice: "/admin/add-price",
  seminal: "/admin/seminal",
  loginAs: "/admin/login-as",
  analytics: "/admin/analytics",
  requests: "/admin/requests",
  positions: "/admin/positions",
  feedback: "/admin/feedback",
  contactMessages: "/admin/contact-messages",
  profile: "/admin/profile",
};

const items = [
  { key: "departments", label: "Departments", icon: LayoutGrid },
  { key: "addCatalog", label: "Add Catalog", icon: PackagePlus },
  { key: "addPrice", label: "Add Price", icon: Tag },
  { key: "seminal", label: "Seminal", icon: GraduationCap },
  { key: "loginAs", label: "Login As", icon: LogIn },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "requests", label: "Requests", icon: ClipboardCheck },
  { key: "positions", label: "Positions", icon: ShieldCheck },
  { key: "feedback", label: "Feedback", icon: MessageSquareWarning },
  { key: "contactMessages", label: "Contact messages", icon: Mail },
  { key: "profile", label: "Profile", icon: User },
];

// Same persistent-left-sidebar shell as every member room, applied to the
// admin side too — a constant menu that never changes no matter which
// department page is open underneath it. Routing is untouched (each
// department keeps its own real route and everything it already does
// inside); this only wraps the outside so navigating between screens never
// means losing the sidebar.
//
// "Add Catalog" (create a new crop/product), "Add Price" (edit an existing
// crop's price), and "Seminal" are real, already-wired features that used
// to be reachable only from inside another department's tabs — surfaced
// here directly per the 2026-09-03 spec ("bring out X for easy access").
// "Login As" is the department picker; ActingAsContext just tracks the
// label shown below, since role_type='admin' already has full access to
// every department route with no separate credential needed.
export default function AdminDashboardShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey =
    Object.keys(ROUTES)
      .filter((key) => key !== "departments")
      .find((key) => location.pathname.startsWith(ROUTES[key])) || "departments";

  function handleSelect(key) {
    navigate(ROUTES[key] || "/admin");
  }

  return (
    <DashboardShell items={items} activeKey={activeKey} onSelect={handleSelect}>
      <ActingAsBanner />
      {children}
    </DashboardShell>
  );
}
