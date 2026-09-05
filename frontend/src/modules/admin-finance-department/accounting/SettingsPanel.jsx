import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const categories = [
  { key: "financial_category", label: "Financial categories" },
  { key: "budget_rule", label: "Budget rules" },
  { key: "approval_rule", label: "Approval rules" },
  { key: "spending_limit", label: "Spending limits" },
  { key: "payment_rule", label: "Payment rules" },
  { key: "tax_configuration", label: "Tax configuration" },
  { key: "currency", label: "Currency" },
  { key: "notification_rule", label: "Notification rules" },
  { key: "system_configuration", label: "System configuration" },
];

export default function SettingsPanel() {
  const [settings, setSettings] = useState([]);
  const [approvalRules, setApprovalRules] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ category: "financial_category", key: "", value: "" });
  const [ruleForm, setRuleForm] = useState({ stepOrder: "", minAmount: "", maxAmount: "", department: "", requiredRole: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ settings }, { rules }] = await Promise.all([
        apiFetch("/finance-department/settings"),
        apiFetch("/finance-department/approval-rules"),
      ]);
      setSettings(settings);
      setApprovalRules(rules);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.key.trim()) return;
    setBusy(true);
    try {
      let value;
      try { value = JSON.parse(form.value); } catch { value = form.value; }
      await apiFetch("/finance-department/settings", { method: "POST", body: { ...form, value } });
      setForm({ ...form, key: "", value: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRuleSubmit(e) {
    e.preventDefault();
    if (!ruleForm.stepOrder || !ruleForm.requiredRole.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/approval-rules", {
        method: "POST",
        body: {
          ...ruleForm,
          stepOrder: Number(ruleForm.stepOrder),
          minAmount: ruleForm.minAmount ? Number(ruleForm.minAmount) : 0,
          maxAmount: ruleForm.maxAmount ? Number(ruleForm.maxAmount) : null,
        },
      });
      setRuleForm({ stepOrder: "", minAmount: "", maxAmount: "", department: "", requiredRole: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm text-ink-600">
          Financial categories, budget/approval/payment rules, spending limits, tax configuration, currency and notification rules.
          Roles and role permissions themselves (Finance Officer, Accountant, Finance Manager, CFO) are managed from the existing
          admin positions/roles screen.
        </p>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="Setting key" required />
          <textarea className="sm:col-span-2" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder='Value (plain text, or JSON e.g. {"limit": 500000})' rows={2} />
          <div className="sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save setting"}</button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {settings.length === 0 && <p className="text-sm text-ink-600">No settings configured yet.</p>}
          {settings.map((s) => (
            <div key={s.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <p className="text-ink-900">{s.key}</p>
              <p className="text-xs text-ink-600">{s.category.replace(/_/g, " ")} · {JSON.stringify(s.value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-900">Approval hierarchy & limits</p>
        <p className="mt-1 text-xs text-ink-600">Which role must sign off a financial request at a given step, gated by amount range and (optionally) department.</p>

        <form onSubmit={handleRuleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input type="number" min="1" value={ruleForm.stepOrder} onChange={(e) => setRuleForm({ ...ruleForm, stepOrder: e.target.value })} placeholder="Step order" required />
          <input value={ruleForm.requiredRole} onChange={(e) => setRuleForm({ ...ruleForm, requiredRole: e.target.value })} placeholder="Required role (e.g. Finance Manager)" required />
          <input type="number" min="0" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })} placeholder="Min amount" />
          <input type="number" min="0" value={ruleForm.maxAmount} onChange={(e) => setRuleForm({ ...ruleForm, maxAmount: e.target.value })} placeholder="Max amount (optional)" />
          <input className="sm:col-span-2" value={ruleForm.department} onChange={(e) => setRuleForm({ ...ruleForm, department: e.target.value })} placeholder="Department (optional — leave blank for all)" />
          <div className="sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Add approval rule"}</button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {approvalRules.length === 0 && <p className="text-sm text-ink-600">No approval rules configured yet.</p>}
          {approvalRules.map((r) => (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              Step {r.step_order}: {r.required_role} — ₦{Number(r.min_amount).toLocaleString()}{r.max_amount ? ` to ₦${Number(r.max_amount).toLocaleString()}` : "+"}
              {r.department ? ` · ${r.department}` : " · all departments"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
