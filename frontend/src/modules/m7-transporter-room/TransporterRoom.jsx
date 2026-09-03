import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
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

export default function TransporterRoom() {
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-600">Module 7</p>
        <h1 className="text-xl font-medium text-ink-900">Transporter's Room</h1>
        <p className="mt-1 text-sm text-ink-600">
          Jobs assigned to you by the Transport Department.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-600">Loading…</p>
      ) : (
        <DriverJobList jobs={myJobs} onUpdate={handleJobUpdate} />
      )}
    </div>
  );
}
