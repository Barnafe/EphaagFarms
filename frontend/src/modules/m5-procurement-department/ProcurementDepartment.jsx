import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, ClipboardList, ShoppingCart, FileCheck2, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { departmentRoleLabel } from "../../utils/departmentRole.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DeptDashboardCards from "../../components/DeptDashboardCards.jsx";
import DepartmentRequestsPanel from "../../components/DepartmentRequestsPanel.jsx";
import OrderQueue from "./OrderQueue.jsx";
import OrderSourcingPanel from "./OrderSourcingPanel.jsx";
import PurchasingPanel from "./PurchasingPanel.jsx";

// Pricing is admin-only now (2026-09-05): standardized prices are set and
// edited exclusively via Admin's Add Catalog / Add Price tools. Procurement
// used to have a read-only "Pricing" tab here with a non-functional "edit"
// button (price editing was never actually wired to it) — removed rather
// than left as a dead, misleading control.
const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "purchasing", label: "Purchasing", icon: ShoppingCart },
  { key: "requests", label: "Requests", icon: FileCheck2 },
  { key: "profile", label: "Profile", icon: User },
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
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState([]);
  const [sourcedOrders, setSourcedOrders] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [processors, setProcessors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
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

  useEffect(() => {
    if (tab === "orders") {
      loadOrders();
      loadSourced();
    }
  }, [tab, loadOrders, loadSourced]);

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

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab} exitTo="/admin">
      <ActingAsBanner />

      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="max-w-5xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
            <h1 className="text-xl font-medium text-white">Procurement Department</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Sourcing, processor assignment, and internal purchasing. Use the sidebar to open
              Orders or Purchasing. Standardized prices are managed by Admin (Add Catalog / Add
              Price), not here.
            </p>
          </div>
          <DeptDashboardCards
            endpoint="/procurement/dashboard"
            onNavigate={setTab}
            buildCards={(d) => [
              { label: "Awaiting sourcing", value: d.ordersAwaitingSourcing, nav: "orders" },
              {
                label: "Awaiting processor assignment",
                value: d.ordersAwaitingProcessorAssignment,
                nav: "orders",
              },
              { label: "Open purchase requests", value: d.openPurchaseRequests, nav: "purchasing" },
            ]}
          />
        </div>
      )}

      {tab === "orders" && (
        <div className="max-w-5xl space-y-6">
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
        </div>
      )}

      {tab === "purchasing" && (
        <div className="max-w-6xl">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Procurement Department</p>
            <h1 className="text-xl font-medium text-white">Purchasing</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Internal purchase requests: need verification → supplier sourcing → purchase order →
              Finance payment → delivery → goods verification → invoice → final payment → audit.
            </p>
          </div>
          <PurchasingPanel />
        </div>
      )}

      {tab === "requests" && <DepartmentRequestsPanel department="Procurement" />}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">Procurement</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: departmentRoleLabel(user, "Procurement") }]} />
        </div>
      )}
    </DashboardShell>
  );
}
