import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Truck, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DriverJobList from "./DriverJobList.jsx";

function mapShipment(s) {
  return {
    id: s.id,
    shipmentReference: s.reference,
    orderReference: s.order_reference,
    status: s.status,
    items: s.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: s.delivery_location,
    proofOfDelivery: s.proof_of_delivery_url,
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Jobs", icon: Truck },
  { key: "profile", label: "Profile", icon: User },
];

export default function TransporterRoom() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [myJobs, setMyJobs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const { shipments } = await apiFetch("/transport/shipments/me");
      setMyJobs(shipments.map(mapShipment));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function handleJobUpdate(jobId, status, proofOfDelivery) {
    try {
      if (status === "en_route") {
        await apiFetch(`/transport/shipments/${jobId}/pickup`, { method: "POST" });
      } else if (status === "delivered") {
        await apiFetch(`/transport/shipments/${jobId}/deliver`, {
          method: "POST",
          body: { proofOfDeliveryUrl: proofOfDelivery },
        });
      }
      await loadJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  const pendingCount = myJobs.filter((j) => j.status !== "delivered").length;

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
              Jobs assigned to you by the Transport Department.
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Jobs in progress</p>
            <p className="text-lg font-medium text-canopy-800">{loading ? "…" : pendingCount}</p>
          </div>
        </div>
      )}

      {tab === "jobs" &&
        (loading ? (
          <p className="text-sm text-canopy-100">Loading…</p>
        ) : (
          <DriverJobList jobs={myJobs} onUpdate={handleJobUpdate} />
        ))}

      {tab === "profile" && <AccountProfileCard user={user} />}
    </DashboardShell>
  );
}
