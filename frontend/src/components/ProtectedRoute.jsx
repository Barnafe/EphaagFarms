import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, allow }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-600">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login/member" replace />;
  }

  if (allow && !allow.includes(session.type === "admin" ? "admin" : session.role)) {
    return <Navigate to="/" replace />;
  }

  return <div className="dash-scope">{children}</div>;
}
