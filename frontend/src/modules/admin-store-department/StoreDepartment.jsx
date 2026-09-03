import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import StockOverview from "./StockOverview.jsx";
import ReceivingPanel from "./ReceivingPanel.jsx";
import AllocationPanel from "./AllocationPanel.jsx";
import RestockRequestPanel from "./RestockRequestPanel.jsx";
import MovementHistory from "./MovementHistory.jsx";

function mapStock(s) {
  return {
    id: s.id,
    crop: s.crop,
    unit: s.unit,
    quantity: Number(s.quantity_on_hand),
    reorderLevel: Number(s.reorder_level),
    low: s.low,
  };
}

function mapOrder(o) {
  return {
    id: o.id,
    orderReference: o.reference,
    items: o.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: o.delivery_location,
    stockCheck: o.stockCheck,
    audit: o.audit,
  };
}

export default function StoreDepartment() {
  const [stock, setStock] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [orders, setOrders] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState(null);
  const [requestingCrop, setRequestingCrop] = useState(null);
  const [restockPrefill, setRestockPrefill] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [{ inventory }, { orders: toReceive }, { orders: queue }, { distributors: dir }, { movements: recent }] =
        await Promise.all([
          apiFetch("/store/inventory"),
          apiFetch("/store/receiving-queue"),
          apiFetch("/store/queue"),
          apiFetch("/store/distributors"),
          apiFetch("/store/movements"),
        ]);
      setStock(inventory.map(mapStock));
      setReceiving(toReceive);
      setOrders(queue.map(mapOrder));
      setDistributors(dir);
      setMovements(recent);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleReceive(orderId, items) {
    try {
      await apiFetch(`/store/orders/${orderId}/receive`, { method: "POST", body: { items } });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAudit(orderId, verified, note) {
    try {
      await apiFetch(`/store/orders/${orderId}/audit`, { method: "POST", body: { verified, note } });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAllocate(orderId, distributorId) {
    try {
      await apiFetch(`/store/orders/${orderId}/allocate`, { method: "POST", body: { distributorId } });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveReorderLevel(stockId, reorderLevel) {
    try {
      await apiFetch(`/store/inventory/${stockId}/reorder-level`, { method: "PATCH", body: { reorderLevel } });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  // Low-stock badge in StockOverview -> prefills the restock form below
  // rather than submitting straight away, since quantity/unit for a
  // purchase request is a judgment call Store should confirm.
  function handleRaiseRestockRequest(item) {
    setRequestingCrop(item.crop);
    setRestockPrefill({ crop: item.crop, quantity: item.quantity, unit: item.unit, reorderLevel: item.reorderLevel });
    setTimeout(() => setRequestingCrop(null), 400);
  }

  async function handleRestockSubmit(body) {
    const { request } = await apiFetch("/store/restock-requests", { method: "POST", body });
    await loadAll();
    return request;
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
          <h1 className="text-xl font-medium text-white">Store Department</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Inventory, receiving, order audits, allocation to distributors, and restock requests.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <StockOverview
          stock={stock}
          onRaiseRestockRequest={handleRaiseRestockRequest}
          requestingCrop={requestingCrop}
          onSaveReorderLevel={handleSaveReorderLevel}
        />
        <ReceivingPanel orders={receiving} onReceive={handleReceive} />
        <AllocationPanel orders={orders} distributors={distributors} onAudit={handleAudit} onAllocate={handleAllocate} />
        <RestockRequestPanel onSubmit={handleRestockSubmit} prefill={restockPrefill} />
        <MovementHistory movements={movements} />
      </div>
    </AdminDashboardShell>
  );
}
