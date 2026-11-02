import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FilePlus2, Truck, History as HistoryIcon, Wallet } from "lucide-react";
import { apiFetch, apiUpload, apiDownload } from "../../api/client.js";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import NewPurchaseRequestForm from "./NewPurchaseRequestForm.jsx";
import PurchaseRequestList from "./PurchaseRequestList.jsx";
import PurchaseRequestDetail from "./PurchaseRequestDetail.jsx";
import SupplierManager from "./SupplierManager.jsx";
import BudgetsPanel from "./BudgetsPanel.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const ACTIVE_STATUSES = [
  "pending_approval",
  "approved",
  "sourcing",
  "budget_approval_pending",
  "po_pending_approval",
  "po_approved",
  "awaiting_delivery",
  "delivered",
  "goods_disputed",
  "goods_received",
  "invoice_verification",
  "final_payment_pending",
];
const TERMINAL_STATUSES = ["completed", "rejected", "cancelled"];

const SECTIONS = [
  { key: "pipeline", label: "Pipeline", icon: ClipboardList, description: "Active purchase requests, stage by stage." },
  { key: "new", label: "New request", icon: FilePlus2, description: "Raise a purchase request for a department." },
  {
    key: "suppliers",
    label: "Vendors",
    icon: Truck,
    description: "External vendor directory for internal purchasing (tools, supplies, services), not farmer/crop sourcing, which is handled in the Orders tab.",
  },
  { key: "budgets", label: "Budgets", icon: Wallet, description: "Annual purchasing budget for each department, and how much of it is committed." },
  { key: "history", label: "History / Audit", icon: HistoryIcon, description: "Completed, rejected and cancelled requests with full trail." },
];

export default function PurchasingPanel() {
  const [section, setSection] = useUrlState("section", null);
  const [requests, setRequests] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null); // my purchasing role: Procurement, Finance, CEO or Main admin

  const load = useCallback(async () => {
    try {
      const [{ requests: r }, { suppliers: s }] = await Promise.all([
        apiFetch("/purchasing/requests"),
        apiFetch("/purchasing/suppliers"),
      ]);
      setRequests(r);
      setSuppliers(s);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    apiFetch("/purchasing/me").then(setMe).catch(() => {});
  }, [load]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setSelected(null);
      return;
    }
    try {
      const { request } = await apiFetch(`/purchasing/requests/${id}`);
      setSelected(request);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  function selectRequest(id) {
    setSelectedId(id);
    loadDetail(id);
  }

  async function refreshAfterAction(fn) {
    try {
      const result = await fn();
      await load();
      if (selectedId) await loadDetail(selectedId);
      setError(null);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  const actions = useMemo(
    () => ({
      approve: (id, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/approve`, { method: "POST", body: { note } })),
      reject: (id, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/reject`, { method: "POST", body: { note } })),
      cancel: (id, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/cancel`, { method: "POST", body: { note } })),
      addQuotation: (id, body) => refreshAfterAction(() => (body instanceof FormData ? apiUpload(`/purchasing/requests/${id}/quotations`, body) : apiFetch(`/purchasing/requests/${id}/quotations`, { method: "POST", body }))),
      attachQuotation: (id, qid, file) => {
        const fd = new FormData(); fd.append("file", file);
        return refreshAfterAction(() => apiUpload(`/purchasing/requests/${id}/quotations/${qid}/attachment`, fd));
      },
      attachInvoice: (id, file) => {
        const fd = new FormData(); fd.append("file", file);
        return refreshAfterAction(() => apiUpload(`/purchasing/requests/${id}/invoice/attachment`, fd));
      },
      downloadQuotation: (id, qid, name) => apiDownload(`/purchasing/requests/${id}/quotations/${qid}/file`, name || "quotation").catch((e) => setError(e.message)),
      downloadInvoice: (id, name) => apiDownload(`/purchasing/requests/${id}/invoice/file`, name || "invoice").catch((e) => setError(e.message)),
      budgetDecision: (id, decision, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/budget-decision`, { method: "POST", body: { decision, note } })),
      selectSupplier: (id, quotationId) =>
        refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/select-supplier`, { method: "POST", body: { quotationId } })),
      createPurchaseOrder: (id, items) =>
        refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/purchase-order`, { method: "POST", body: { items } })),
      decidePO: (poId, decision, note) =>
        refreshAfterAction(() => apiFetch(`/purchasing/purchase-orders/${poId}/decide`, { method: "POST", body: { decision, note } })),
      authorizePayment: (id, body) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/authorize-payment`, { method: "POST", body })),
      markDelivered: (id, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/mark-delivered`, { method: "POST", body: { note } })),
      verifyGoods: (id, result, note) =>
        refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/verify-goods`, { method: "POST", body: { result, note } })),
      resolveDispute: (id, action, note) =>
        refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/resolve-dispute`, { method: "POST", body: { action, note } })),
      recordInvoice: (id, body) => refreshAfterAction(() => (body instanceof FormData ? apiUpload(`/purchasing/requests/${id}/invoice`, body) : apiFetch(`/purchasing/requests/${id}/invoice`, { method: "POST", body }))),
      verifyInvoice: (id, note) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/verify-invoice`, { method: "POST", body: { note } })),
      finalPayment: (id, body) => refreshAfterAction(() => apiFetch(`/purchasing/requests/${id}/final-payment`, { method: "POST", body })),
    }),
    [selectedId, load, loadDetail]
  );

  async function createSupplier(draft) {
    await refreshAfterAction(() => apiFetch("/purchasing/suppliers", { method: "POST", body: draft }));
  }
  async function updateSupplier(id, draft) {
    await refreshAfterAction(() => apiFetch(`/purchasing/suppliers/${id}`, { method: "PATCH", body: draft }));
  }
  async function createRequest(body) {
    return refreshAfterAction(() => apiFetch("/purchasing/requests", { method: "POST", body }));
  }

  const activeRequests = requests.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const historyRequests = requests.filter((r) => TERMINAL_STATUSES.includes(r.status));

  return (
    <div className="space-y-4">
      <DeptSectionNav sections={SECTIONS} activeKey={section} onSelect={setSection} deptLabel="purchasing sections" />
      {error && <p className="text-sm text-clay-100">{error}</p>}

      {section === "pipeline" && (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <PurchaseRequestList requests={activeRequests} selectedId={selectedId} onSelect={selectRequest} />
          <PurchaseRequestDetail request={selected} suppliers={suppliers} actions={actions} me={me} />
        </div>
      )}

      {section === "new" && <NewPurchaseRequestForm onSubmit={createRequest} />}

      {section === "budgets" && <BudgetsPanel me={me} />}

      {section === "suppliers" && (
        <SupplierManager suppliers={suppliers} onCreate={createSupplier} onUpdate={updateSupplier} />
      )}

      {section === "history" && (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <PurchaseRequestList requests={historyRequests} selectedId={selectedId} onSelect={selectRequest} />
          <PurchaseRequestDetail request={selected} suppliers={suppliers} actions={actions} me={me} />
        </div>
      )}
    </div>
  );
}
