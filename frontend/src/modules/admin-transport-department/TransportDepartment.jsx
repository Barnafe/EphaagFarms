import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DispatchPanel from "./DispatchPanel.jsx";

function mapOrder(o) {
  return {
    id: o.id,
    orderReference: o.reference,
    items: o.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: o.delivery_location,
    driverId: null,
    shipmentReference: null,
  };
}

export default function TransportDepartment() {
  const [dispatchQueue, setDispatchQueue] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [{ orders }, { drivers: dir }] = await Promise.all([
        apiFetch("/transport/queue"),
        apiFetch("/transport/drivers"),
      ]);
      setDispatchQueue(orders.map(mapOrder));
      setDrivers(dir.map((d) => ({ ...d, fleetType: "Driver" })));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleAssign(orderId, driverId) {
    try {
      await apiFetch(`/transport/orders/${orderId}/assign-driver`, {
        method: "POST",
        body: { driverId },
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">Transport Department</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Assigns drivers and generates shipment documents once goods are ready to move.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <DispatchPanel jobs={dispatchQueue} drivers={drivers} onAssign={handleAssign} />
    </div>
    </AdminDashboardShell>
  );
}
