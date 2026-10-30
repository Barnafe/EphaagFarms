import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

// The place money is sent to. Entered once; Paystack confirms the account name, so it cannot be mistyped to the wrong person.
export default function BankAccountCard({ purpose = "Withdrawals, loans and payouts are sent here automatically." }) {
  const [account, setAccount] = useState(undefined);
  const [banks, setBanks] = useState([]);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => { apiFetch("/bank-account").then((r) => setAccount(r.account)).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (editing || account === null) apiFetch("/bank-account/banks").then((r) => setBanks(r.banks)).catch((e) => setError(e.message));
  }, [editing, account]);

  async function save(e) {
    e.preventDefault();
    setError(""); setSaved("");
    if (!bankCode) { setError("Please choose your bank."); return; }
    if (!/^\d{10}$/.test(number)) { setError("Enter your 10-digit account number."); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/bank-account", { method: "POST", body: { bankCode, accountNumber: number } });
      setAccount({ bankName: banks.find((b) => b.code === bankCode)?.name, accountName: r.account.accountName, last4: r.account.last4 });
      setEditing(false); setNumber(""); setSaved(`Saved. The bank confirms this account belongs to ${r.account.accountName}.`);
    } catch (ex) { setError(ex.message); } finally { setBusy(false); }
  }

  if (account === undefined) return error ? <p className="text-sm text-red-700">{error}</p> : null;
  const showForm = account === null || editing;
  return (
    <div className="card field space-y-3">
      <p className="text-sm font-medium text-ink-900">Bank account</p>
      {account && !editing && (
        <div className="text-sm text-ink-900">
          <p>{account.accountName}</p>
          <p className="text-xs text-ink-600">{account.bankName} · account ending {account.last4}</p>
          <button type="button" className="mt-1 text-xs text-canopy-800 underline" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}
      {account === null && <p className="text-xs text-ink-600">{purpose} Add your account once.</p>}
      {showForm && (
        <form onSubmit={save} className="space-y-3">
          <div><label htmlFor="bank-select">Bank</label>
            <select id="bank-select" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
              <option value="">Select your bank</option>
              {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div><label htmlFor="account-number">Account number</label>
            <input id="account-number" inputMode="numeric" maxLength={10} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" />
          </div>
          <div className="flex gap-3">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Checking with your bank…" : "Save bank account"}</button>
            {editing && <button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
      {saved && <p className="text-xs text-canopy-800" role="status">{saved}</p>}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
