import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const docTypes = [
  { key: "", label: "All" },
  { key: "customer_invoice", label: "Customer invoices" },
  { key: "supplier_invoice", label: "Supplier invoices" },
  { key: "receipt", label: "Receipts" },
  { key: "payment_voucher", label: "Payment vouchers" },
  { key: "credit_note", label: "Credit notes" },
  { key: "debit_note", label: "Debit notes" },
  { key: "contract", label: "Contracts" },
  { key: "supporting_document", label: "Supporting documents" },
];

const emptyForm = { docType: "supporting_document", reference: "", filePath: "", fileName: "", amount: "" };

export default function DocumentsPanel() {
  const [documents, setDocuments] = useState([]);
  const [docType, setDocType] = useState("");
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (docType) params.set("docType", docType);
      const { documents } = await apiFetch(`/finance-department/documents?${params.toString()}`);
      setDocuments(documents);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.filePath.trim() || !form.fileName.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/documents", { method: "POST", body: { ...form, amount: form.amount ? Number(form.amount) : null } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Customer/supplier invoices, receipts, vouchers, credit/debit notes and contracts on file.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ File a document</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {docTypes.map((t) => (
          <button key={t.key || "all"} type="button" onClick={() => setDocType(t.key)} className={`rounded-full px-3 py-1 text-xs ${docType === t.key ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
            {docTypes.filter((t) => t.key).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Reference / invoice no. (optional)" />
          <input className="sm:col-span-2" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="File name" required />
          <input className="sm:col-span-2" value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} placeholder="File URL / path" required />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "File document"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {documents.length === 0 && <p className="text-sm text-ink-600">No documents filed yet.</p>}
        {documents.map((d) => (
          <a key={d.id} href={d.file_path} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm hover:border-canopy-400">
            <div>
              <p className="text-ink-900">{d.file_name}</p>
              <p className="text-xs text-ink-600">{d.doc_type.replace(/_/g, " ")} {d.reference ? `· ${d.reference}` : ""}</p>
            </div>
            {d.amount != null && <span className="font-medium text-ink-900">₦{Number(d.amount).toLocaleString()}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
