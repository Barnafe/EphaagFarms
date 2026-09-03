import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, MessageSquareWarning, User, BarChart3, ClipboardCheck, ShieldCheck } from "lucide-react";
import DashboardShell from "./DashboardShell.jsx";

const items = [
  { key: "departments", label: "Departments", icon: LayoutGrid },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "requests", label: "Requests", icon: ClipboardCheck },
  { key: "positions", label: "Positions", icon: ShieldCheck },
  { key: "feedback", label: "Feedback", icon: MessageSquareWarning },
  { key: "profile", label: "Profile", icon: User },
];

// Same persistent-left-sidebar shell as every member room, applied to the
// admin side too — a constant "Departments" / "Analytics" / "Requests" /
// "Positions" / "Feedback" / "Profile" menu that never changes no matter
// which department page is open underneath it. Routing is untouched (each
// department keeps its own real route and everything it already does
// inside); this only wraps the outside so navigating between departments
// never means losing the sidebar.
export default function AdminDashboardShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = location.pathname.startsWith("/admin/profile")
    ? "profile"
    : location.pathname.startsWith("/admin/feedback")
    ? "feedback"
    : location.pathname.startsWith("/admin/analytics")
    ? "analytics"
    : location.pathname.startsWith("/admin/requests")
    ? "requests"
    : location.pathname.startsWith("/admin/positions")
    ? "positions"
    : "departments";

  function handleSelect(key) {
    if (key === "profile") navigate("/admin/profile");
    else if (key === "feedback") navigate("/admin/feedback");
    else if (key === "analytics") navigate("/admin/analytics");
    else if (key === "requests") navigate("/admin/requests");
    else if (key === "positions") navigate("/admin/positions");
    else navigate("/admin");
  }

  return (
    <DashboardShell items={items} activeKey={activeKey} onSelect={handleSelect}>
      {children}
    </DashboardShell>
  );
}
