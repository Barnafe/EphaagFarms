// The payment preview: Amount, Paystack Charges, Total for any signed-in customer.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pay, db, newUser } from "../helpers/api.mjs";
import { calculateFee } from "../../src/services/paystack.js";
import { pool } from "../../src/db/pool.js";

process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

test("fee-quote gives the amount, the Paystack charges and the total", async () => {
  const u = await newUser();
  const r = await pay("/payments/fee-quote?amount=50000", { token: u.token });
  assert.equal(r.status, 200);
  const exp = calculateFee(50000);
  assert.equal(r.data.amount, 50000);
  assert.equal(r.data.fee, exp.fee);
  assert.equal(r.data.total, exp.gross);
  assert.equal(r.data.available, true);
});

test("fee-quote refuses a bad amount and needs a sign-in", async () => {
  const u = await newUser();
  assert.equal((await pay("/payments/fee-quote?amount=0", { token: u.token })).status, 400);
  assert.equal((await pay("/payments/fee-quote?amount=abc", { token: u.token })).status, 400);
  assert.equal((await pay("/payments/fee-quote?amount=1000")).status, 401);
});
