import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Truck, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DriverTrips from "./DriverTrips.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Trips", icon: Truck },
  { key: "profile", label: "Profile", icon: User },
];

export default function TransporterRoom() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useUrlState("tab", "dashboard");
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    try {
      const { trips } = await apiFetch("/transport/trips/me");
      setTrips(trips);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  if (!user) return null;

  const pendingCount = trips.filter((t) => ["planned", "en_route", "broken_down"].includes(t.status)).length;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-medium text-white">Welcome, {user.name}</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Trips assigned to you by the Transport Department.
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Trips in progress</p>
            <p className="text-lg font-medium text-canopy-800">{loading ? "…" : pendingCount}</p>
          </div>
        </div>
      )}

      {tab === "jobs" &&
        (loading ? (
          <p className="text-sm text-canopy-100">Loading…</p>
        ) : (
          <DriverTrips trips={trips} reload={loadTrips} />
        ))}

      {tab === "profile" && <AccountProfileCard user={user} />}
    </DashboardShell>
  );
}
