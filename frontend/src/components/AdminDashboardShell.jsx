import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
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
  dashboard: "/admin",
  addCatalog: "/admin/add-catalog",
  addPrice: "/admin/add-price",
  trc: "/admin/trc",
  loginAs: "/admin/login-as",
  analytics: "/admin/analytics",
  requests: "/admin/requests",
  positions: "/admin/positions",
  feedback: "/admin/feedback",
  contactMessages: "/admin/contact-messages",
  profile: "/admin/profile",
};

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "addCatalog", label: "Add Catalog", icon: PackagePlus },
  { key: "addPrice", label: "Add Price", icon: Tag },
  { key: "trc", label: "TRC", icon: GraduationCap },
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
// screen is open underneath it.
//
// "Add Catalog" (create a new crop/product), "Add Price" (edit an existing
// crop's price), and "TRC" are real, already-wired features surfaced
// here directly for easy access. "Login As" is the department picker —
// picking one there drops the admin into that department's OWN shell
// (its own hamburger with that department's sections), not this generic
// one. Because of that, departments themselves are deliberately NOT listed
// here (2026-09-04) — this sidebar is for admin-wide tools; "Dashboard" is
// the one item that always brings you back to the summary/welcome screen.
export default function AdminDashboardShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey =
    Object.keys(ROUTES)
      .filter((key) => key !== "dashboard")
      .find((key) => location.pathname.startsWith(ROUTES[key])) || "dashboard";

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
