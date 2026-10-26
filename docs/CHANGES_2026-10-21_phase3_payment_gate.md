# v26 — Phase 3: corps access-fee payment gate

Rule: a corps member must pay the one-time access fee before any corps
course opens or anything counts toward their progress.

## Decisions (from the founder)
- Manual confirmation by an admin until Paystack is connected; the gateway is **Paystack**.
- Each confirmed payment is posted to the Finance ledger as income.
- Admin can **refund & revoke access** with a recorded reason.
- Unpaid members cannot see course details at all (the course list itself is gated).
- The fee is editable by admin at any time.

## Backend
- `corper_payments` table (migration block 23): unique reference (`CPAY-YYYYMMDD-XXXX`), amount snapshot, status
  `pending|paid|failed|cancelled|refunded`, provider `manual|paystack`, who confirmed/refunded and why.
  Partial unique indexes: one pending and one paid payment per member (a refunded one stops counting).
- Fee lives in `finance_settings` (`system_configuration` / `corper_access_fee`, `{"amount": N}`); changes are written to `finance_audit_log`.
- `confirmPayment()` (controllers/corperPaymentController.js) is the ONE confirmation path (admin, Paystack return, Paystack webhook). Row-locked, safe to run twice, posts `finance_income` + `finance_transactions` in the same DB transaction, emails a receipt (a mail failure never blocks it).
- Refund: status -> `refunded`, negative `finance_income` row + `refund` transaction so revenue totals stay honest; the gate closes immediately.
- `middleware/corperPaid.js` -> HTTP 402 `{code:"PAYMENT_REQUIRED"}` for unpaid members. `GET /api/corpers/courses` is the first gated endpoint (titles/descriptions/counts only). Phase 4 lesson/quiz endpoints go behind the same middleware.
- Paystack: `utils/paymentProvider.js`. Initialize with the server's amount (kobo), verify checks status, amount, currency and reference. Webhook `POST /api/corpers/paystack-webhook` verifies the HMAC-SHA512 signature over the raw body (`server.js` keeps `req.rawBody` for that path only).
- `GET /api/corpers/me` now includes `access` (paid / pending / unpaid).
- Member routes: `GET /corpers/payments`, `POST /corpers/payments/initiate`, `POST /corpers/payments/:id/cancel`, `POST /corpers/payments/:reference/verify`, `GET /corpers/courses` (gated).
- Admin routes (`/api/rtc/admin/corps/...`): `fee` GET/PUT, `payments` list (status, q), `payments/summary`, `payments/:id/confirm|reject|refund`.
- TRC dashboard summary gained `corpsPaymentsPending`, `corpsPaidMembers`.

## Frontend
- Corps member: real **Payments** tab (fee card, Pay now, awaiting-confirmation banner, receipt, history), **My Training** unlocks after payment and shows a locked panel before, Dashboard step 2 and progress card are live. Returning from Paystack (`?corperPayment=REF`) is verified automatically.
- Admin: new **Corps** tab in TRC (fee editor, summary cards, filterable/searchable list, confirm / reject / refund with reasons).

## Going live with Paystack
Set `PAYSTACK_SECRET_KEY` and `FRONTEND_ORIGIN` on Render, and add the webhook URL
`https://<your-site>/api/corpers/paystack-webhook` in the Paystack dashboard. If the key is set but the webhook isn't,
members are still unlocked when they return to the site after paying (and admin can confirm by hand).
Refunds of Paystack payments must be returned from the Paystack dashboard — the admin action records it and closes access.

## Known limits
- Manual mode shows no bank details to the member (none exist in the system yet) — the admin tells them how to pay and they quote the reference.
- Quiz/lesson taking, progress and certificate are phase 4+.
