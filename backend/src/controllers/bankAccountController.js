import { pool } from "../db/pool.js";
import { listBanks, resolveAccount, createTransferRecipient } from "../services/paystack.js";
import { kickPayouts } from "../services/payouts.js";

// GET /api/bank-account/banks
export async function banks(req, res) { res.json({ banks: await listBanks() }); }

// GET /api/bank-account — the saved account (never the full number once saved)
export async function mine(req, res) {
  const { rows } = await pool.query(`SELECT bank_code, bank_name, account_number, account_name, verified_at FROM bank_accounts WHERE user_id = $1`, [req.user.id]);
  const a = rows[0];
  res.json({ account: a ? { bankCode: a.bank_code, bankName: a.bank_name, accountName: a.account_name, last4: a.account_number.slice(-4), verifiedAt: a.verified_at } : null });
}

// POST /api/bank-account { bankCode, accountNumber } — Paystack confirms the account name; saved once.
export async function save(req, res) {
  const { bankCode, accountNumber } = req.body || {};
  if (!/^\d{10}$/.test(String(accountNumber || ""))) return res.status(400).json({ error: "Enter your 10-digit account number." });
  const list = await listBanks();
  const bank = list.find((b) => b.code === String(bankCode));
  if (!bank) return res.status(400).json({ error: "Please choose your bank." });
  const accountName = await resolveAccount(String(accountNumber), bank.code);
  const recipient = await createTransferRecipient({ name: accountName, accountNumber: String(accountNumber), bankCode: bank.code });
  await pool.query(
    `INSERT INTO bank_accounts (user_id, bank_code, bank_name, account_number, account_name, recipient_code) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET bank_code = EXCLUDED.bank_code, bank_name = EXCLUDED.bank_name, account_number = EXCLUDED.account_number,
       account_name = EXCLUDED.account_name, recipient_code = EXCLUDED.recipient_code, verified_at = now(), updated_at = now()`,
    [req.user.id, bank.code, bank.name, String(accountNumber), accountName, recipient]);
  kickPayouts();   // anything that was waiting for these details is sent now
  res.status(201).json({ account: { bankCode: bank.code, bankName: bank.name, accountName, last4: String(accountNumber).slice(-4) } });
}
