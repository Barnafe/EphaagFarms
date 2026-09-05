import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const emptyForm = { name: "", accountType: "bank", accountNumber: "", bankName: "", openingBalance: "" };

export default function BankCashPanel() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [transferForm, setTransferForm] = useState({ fromAccountId: "", toAccountId: "", amount: "", description: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { accounts } = await apiFetch("/finance-department/accounts");
      setAccounts(accounts);
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
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/accounts", { method: "POST", body: { ...form, openingBalance: Number(form.openingBalance || 0) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeposit(id) {
    const amount = Number(prompt("Deposit amount:") || "0");
    if (!amount) return;
    try {
      await apiFetch(`/finance-department/accounts/${id}/deposit`, { method: "POST", body: { amount, description: "Manual deposit" } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleWithdraw(id) {
    const amount = Number(prompt("Withdrawal amount:") || "0");
    if (!amount) return;
    try {
      await apiFetch(`/finance-department/accounts/${id}/withdraw`, { method: "POST", body: { amount, description: "Manual withdrawal" } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTransfer(e) {
    e.preventDefault();
    const { fromAccountId, toAccountId, amount } = transferForm;
    if (!fromAccountId || !toAccountId || !amount) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/accounts/transfer", { method: "POST", body: { ...transferForm, amount: Number(amount) } });
      setTransferForm({ fromAccountId: "", toAccountId: "", amount: "", description: "" });
      setShowTransfer(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Bank accounts, cash accounts, petty cash, deposits, withdrawals and transfers.</p>
        <div className="flex gap-2">
          <button className="btn-outline" type="button" onClick={() => setShowTransfer((v) => !v)}>Transfer</button>
          <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New account</button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" required />
          <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="petty_cash">Petty cash</option>
          </select>
          <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name (if applicable)" />
          <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account number" />
          <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder="Opening balance" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create account"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {showTransfer && (
        <form onSubmit={handleTransfer} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={transferForm.fromAccountId} onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })} required>
            <option value="">From account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={transferForm.toAccountId} onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })} required>
            <option value="">To account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} placeholder="Amount" required />
          <input value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} placeholder="Description (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Transferring…" : "Transfer"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowTransfer(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {accounts.length === 0 && <p className="text-sm text-ink-600">No accounts yet.</p>}
        {accounts.map((a) => (
          <div key={a.id} className="rounded-card border border-soil-200 p-3">
            <p className="font-medium text-ink-900">{a.name}</p>
            <p className="text-xs text-ink-600">{a.account_type.replace("_", " ")} {a.bank_name ? `· ${a.bank_name}` : ""} {a.account_number ? `· ${a.account_number}` : ""}</p>
            <p className="mt-2 text-xl font-medium text-ink-900">₦{Number(a.current_balance).toLocaleString()}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-outline text-xs" type="button" onClick={() => handleDeposit(a.id)}>Deposit</button>
              <button className="btn-outline text-xs" type="button" onClick={() => handleWithdraw(a.id)}>Withdraw</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
