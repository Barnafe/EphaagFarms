# v31: final-round hardening before Phase 2 (base: v30)

> **Updated in v34:** refunds now exist only in the admin **Refund room** (see `LATE-FEES-AND-REFUND-ROOM.md`). Anything below about automatic refunds, a "Refunds due" list, "Mark refunded" or refunds through Finance is replaced by that.

## Two serious bugs in v29 and v30 (fixed here)
1. **The frontend stopped sending the login token.** My change to `authHeaders()` in v29 dropped the `Authorization` header, so every logged-in screen failed to load. Found by the new real-browser tests. **Do not deploy the v29 or v30 frontend.**
2. **The app's own pages were blocked (HTTP 403)** when the site address did not exactly match `FRONTEND_ORIGIN`: a browser sends an Origin header on module scripts even for same-origin pages. A request from the app's own address is now always allowed.

## Open items closed
- **Real browser tests now run** (7 pass, desktop and phone size): buyer checkout through the stand-in Paystack, duplicate warning, refused payment, sign-in. `e2e/run-local.mjs` runs them where Chromium cannot be downloaded. Later-phase journeys stay `test.fixme`.
- **Connection-pool audit**: a runtime guard fails the test run if code holds a connection while asking for another. It found and I fixed: corps batch close (v28), request creation and maintenance request creation (v28), and my own order and payment code. `release()` is now safe to call twice, and pool size is 20 (`DB_POOL_MAX`). The advisory-lock connection in the job runner is deliberate and excluded.
- **Profile photos**: kept public (random names). Reason: private would need a fresh 5-minute link for every picture in every dashboard.

## Payment rules (Phase 1 revised)
See `PHASE1-BUYER-PAYMENTS.md`. In short: no manual Clear/Reject; refusal is automatic and explained to the payer; Finance only sees "Refunds due"; automatic refund through Paystack is a setting (off); duplicate-order notice at checkout; expired and cancelled orders have no payment channel.

## Smaller fixes
- `store_test.py` no longer needs a `.env` file; `fund_buyer_balance` keeps it working now that upfront orders need a real payment.
- Settings can be read on a transaction's own connection (`getSetting(key, fallback, runner)`).
- Migration `004_payment_refusals.sql` (refused status, refund columns, order items signature).

## Defaults I chose because you did not answer (all editable in Finance -> Payment confirmations -> Settings)
No automatic refunds (v34: none at all; the Refund room is the only way money is returned). Duplicate window 24 hours. Order expiry 24 hours. Profile photos public.
