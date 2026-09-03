import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Tag } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import OrderQueue from "./OrderQueue.jsx";
import OrderSourcingPanel from "./OrderSourcingPanel.jsx";
import PriceListManager from "./PriceListManager.jsx";

const SECTIONS = [
  {
    key: "orders",
    label: "Orders",
    icon: ClipboardList,
    description: "Source pending orders from farmers and assign a processor once sourced.",
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: Tag,
    description: "Standardized price list (display-only — edited from Finance Department).",
  },
];

function mapOrder(o) {
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    items: o.items.map((i) => ({ crop: i.crop, quantity: Number(i.quantity), unit: i.unit })),
    deliveryLocation: o.delivery_location,
    notifiedReps: [],
  };
}

function mapFarmer(f) {
  return {
    id: f.id,
    name: f.name,
    crops: f.crops || [],
    state: f.state,
    lga: f.lga,
    repContact: f.phone,
  };
}

export default function ProcurementDepartment() {
  const [tab, setTab] = useState(null); // null | "orders" | "pricing"
  const [orders, setOrders] = useState([]);
  const [sourcedOrders, setSourcedOrders] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [processors, setProcessors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [prices, setPrices] = useState([]);
  const [error, setError] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const [{ orders: queue }, { farmers: dir }] = await Promise.all([
        apiFetch("/procurement/queue"),
        apiFetch("/procurement/farmers"),
      ]);
      const mapped = queue.map(mapOrder);
      setOrders(mapped);
      setFarmers(dir.map(mapFarmer));
      setSelectedId((prev) => prev ?? mapped[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadSourced = useCallback(async () => {
    try {
      const [{ orders: queue }, { processors: dir }] = await Promise.all([
        apiFetch("/procurement/sourced"),
        apiFetch("/procurement/processors"),
      ]);
      setSourcedOrders(queue.map((o) => ({ ...mapOrder(o), sourcedFrom: o.sourcedFrom })));
      setProcessors(dir);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const { prices: list } = await apiFetch("/orders/catalog");
      setPrices(
        list.map((p) => ({
          crop: p.crop,
          unit: p.unit,
          price: Number(p.price),
          lastReviewed: p.last_reviewed,
        }))
      );
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "orders") {
      loadOrders();
      loadSourced();
    } else if (tab === "pricing") {
      loadPrices();
    }
  }, [tab, loadOrders, loadSourced, loadPrices]);

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  async function handleSource(orderId, sourcing, notifiedRep) {
    try {
      await apiFetch(`/procurement/orders/${orderId}/source`, {
        method: "POST",
        body: { sourcing, notifiedRep },
      });
      setSelectedId(null);
      await Promise.all([loadOrders(), loadSourced()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignProcessor(orderId, processorId) {
    try {
      await apiFetch(`/procurement/orders/${orderId}/assign-processor`, {
        method: "POST",
        body: { processorId },
      });
      await loadSourced();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">Procurement Department</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Sourcing, processor assignment, and the standardized price list.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <DeptSectionNav sections={SECTIONS} activeKey={tab} onSelect={setTab} deptLabel="Procurement sections" />

      {tab === "orders" && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OrderQueue orders={orders} selectedId={selectedId} onSelect={setSelectedId} />
            {selectedOrder ? (
              <OrderSourcingPanel
                order={selectedOrder}
                farmers={farmers}
                onNotify={(orderId, sourcing, reps) => handleSource(orderId, sourcing, reps.join(", "))}
              />
            ) : (
              <div className="card text-sm text-ink-600">Select an order to source it.</div>
            )}
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Ready for processor assignment</p>
            <div className="mt-3 space-y-3">
              {sourcedOrders.length === 0 && (
                <p className="text-sm text-ink-600">Nothing sourced and waiting on a processor yet.</p>
              )}
              {sourcedOrders.map((o) => (
                <div key={o.id} className="rounded-card border border-soil-200 p-3">
                  <p className="text-xs font-medium text-canopy-800">{o.reference}</p>
                  <p className="mt-1 text-sm text-ink-900">
                    {o.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
                  </p>
                  <p className="text-xs text-ink-600">
                    Sourced from: {o.sourcedFrom.join(", ") || "—"} · to {o.deliveryLocation}
                  </p>
                  <select
                    className="mt-2 rounded-card border border-soil-200 px-2 py-1 text-sm"
                    defaultValue=""
                    onChange={(e) => e.target.value && handleAssignProcessor(o.id, e.target.value)}
                  >
                    <option value="">Assign a processor…</option>
                    {processors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "pricing" && (
        <PriceListManager
          prices={prices}
          onUpdate={() => {
            /* Price editing isn't wired yet — standardized prices are set
               offline per the annual review, this UI is display-only for now. */
          }}
        />
      )}
    </div>
    </AdminDashboardShell>
  );
}
