# Late share fees and the Refund room (v34)

## Late share payments
A share purchase falls due 24 hours after it is created (setting `share_expiry_hours`). It is **not refused or dropped** when it falls due.

| Rule | Value (editable in Admin > Finance > Payments > Settings) |
|---|---|
| Late fee | 2% of the share amount per month, spread per day (2% / 30 per whole day late) |
| Starts | the first moment after it fell due, no grace before it |
| Stops growing | after 30 days (fee cap = 2% of the share amount) |
| Grace period | 10 days after the fee stops growing to pay share price + capped fee |
| After grace | the purchase is taken down completely (status `expired`, reason `grace_ended`) |

Examples for 2 shares (₦50,000): day 1 = ₦33.33, day 10 = ₦333.33, day 30 and after = ₦1,000.

* The late fee is Finance income (category "Share late fee"). It is never share capital: each share stays exactly ₦25,000.
* The farmer sees the automatically calculated fee and must tick "I agree to pay the late fee" before paying. `POST /farmers/me/shares/purchases/:ref/pay` answers **409 `LATE_FEE`** with the quote; sending `{ acceptLateFee: true, lateFee: <quoted amount> }` proceeds. A wrong or missing amount never starts a payment. The processing fee is added on top, as for every payment.
* An agreed fee is honoured for 24 hours. If the fee has grown and the quote is older than that, the payment is not applied (`quote_expired`) and goes to the Refund room.
* Notices go out **once each, by email and SMS**: late fee started, grace started, final warning (3 days before the end), taken down. The job `expire-share-purchases` runs every 10 minutes.
* Late loan repayments keep the calculation already built (Phase 5 will extend instalments).

## The Refund room (admin)
There are no refund features on orders, shares or corps fees. The system itself detects duplicates (warning and Proceed to pay), rejects expired, cancelled, wrong amount and wrong currency payments with a reason on screen, and handles money automatically.

The single **Refund room** (Admin Hub > Refund room, `/admin/refunds`, API `/api/refunds`) is for exceptions:
* **Needs attention**: money that arrived but could not be applied (for example a stale payment page). It is never applied; every admin is emailed and the alert phone is texted at once.
* **Refund a payment**: search by reference, order or purchase number, payer name or email (for example goods delivered wrongly and returned).
* **History**: refunded payments with their reasons.

Rules: full refunds only; a written reason is required; the payer is notified on all channels; Paystack keeps its own fee; every admin may use it; blocked while an admin is "acting as" a department. A refunded order is marked `refunded`. If Paystack cannot process a refund the payment stays on the list (`failed`) and can be retried.

## Corps access fee
After the first successful payment the dashboard opens and no pay button shows again. Before any new attempt the system scans Paystack for an earlier payment. Hand confirmation when Paystack is unreachable is kept as an exception (reason mandatory, flagged, every admin notified).

## Tests
`backend/test/api/payments-shares.test.mjs` (late-fee maths, consent flow, notices, take-down), `payments-orders.test.mjs` (Refund room), `payments-corps.test.mjs` (scan before pay, manual-confirmation notice), and browser journeys 9 and 10 in `e2e/tests/journeys.spec.js`.
