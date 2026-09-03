import { useAuth } from "../../context/AuthContext.jsx";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";

export default function AdminProfilePage() {
  const { session } = useAuth();
  const user = session?.user;

  if (!user) return null;

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Profile</h1>
        </div>
        <AccountProfileCard user={user} />
      </div>
    </AdminDashboardShell>
  );
}
