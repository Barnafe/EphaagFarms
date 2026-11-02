# Phases 7 and 9: Research, Consultancy and Analytics

Built on v39. Migration: `014_research_consultancy.sql` (safe to run on every boot).

## Phase 7: Research (internal) and Consultancy (public)

### Agreed decisions (22 Oct 2026)
1. Research is internal: a title, a summary and a PDF. Only staff can read or download it. No member or public route exists.
2. Consultancy stays on the main home page. Anyone, member or guest with no account, can apply.
3. Nothing is paid at application. After an admin approves, the amount and payment terms are sent to the applicant, who then pays through Paystack.
4. When an admin schedules it, the applicant gets the date, time, place or meeting link and a note from the consultant.

### Research
- `POST /api/rtc/admin/research` (multipart: title, optional summary, `file` = PDF, required). `GET /api/rtc/admin/research` lists. `GET /api/rtc/admin/research/:id/file` downloads (admin only, forced download). `DELETE` removes the item and its file.
- Stored in the private `research_pdf` category (PDF only, 25 MB). A member cannot reach it through `/api/files/:id` either.
- The old member route `GET /api/rtc/research` is gone (404). Research was also removed from the public Research & Education page.

### Consultancy flow
`pending` -> (admin approves with a fee + payment terms) `awaiting_payment` -> (Paystack payment verified) `ready` -> (admin schedules) `scheduled` -> `completed`. Also `rejected` and `cancelled`. A fee of 0 skips payment (`pending` -> `ready`).
- Public API (`/api/consultancy`): `GET /offerings`, `POST /requests` (rate-limited 5/hour/IP, optional sign-in links it to a member), `GET /track/:token`, `POST /track/:token/pay`. The applicant's private link is `/consultancy/request/:token` (a 48-hex secret, emailed or sent by SMS).
- Admin API: `GET /admin/requests`, `POST /admin/requests/:id/approve | reject | cancel | schedule | complete`. Member: `GET /requests/me`.
- Money rules (as for every payment type): the amount comes from the server; Paystack's fee is added for the payer; a repeat click reuses the same waiting payment; a wrong amount or a payment for a closed request is refused and lands in the Refund room (the guest is told, using the contact details saved with the payment); finance income is the fee only; Finance and admins are notified. Refunding a paid consultancy in the Refund room cancels the session.
- Messages: received, approved (fee + processing fee + terms + link), approved free, rejected, receipt, scheduled (date, time, place, note), and admin notices. Applicants without an email get SMS. `notifyAddress()` in `messaging.js` sends to someone with no account.
- Screens: Home page "Book a consultancy session" form; `/consultancy/request/:token` (status, fee, Pay button, session details); TRC > Research (PDF upload, download, remove); TRC > Consultancy > Requests (approve with fee and terms, decline, schedule, reschedule, complete, cancel).

## Phase 9: Analytics

### Agreed decisions
Key charts only (overview, produce by crop and state, loans, savings trend); filters drill down through state, LGA, ward and unit; an Excel export and a printable summary report.

- Every analytics endpoint (`overview, farmers, produce, produce/capacity, loans, savings, training`) takes `state`, `lga`, `ward`, `unit` (the farmer's registered location, exact match, parameterised).
- `GET /api/analytics/geo-options?state&lga&ward` feeds the cascading drop-downs. `GET /api/analytics/summary` returns everything the key charts, the report and the export use; its area breakdown moves one level deeper as you drill (state -> LGAs -> wards -> units). `GET /api/analytics/export.xlsx` returns the workbook (Summary, Produce by crop, By <level>, Loans, Savings trend) for the chosen location.
- Screens: Admin > Analytics opens on **Key charts**; the filter lives in the page address, so a view can be shared; **Download Excel**; **Printable report** (`/admin/analytics/report?...`, Print or Save as PDF).
- Produce totals are never added across different units (a crop is shown in its own unit).

## Fixed on the way
- A background message-queue drain could pick up a request's connection-tracking context and trip the pool guard intermittently. The fire-and-forget drain now runs outside any request context; a drain someone waits for stays tracked.
- `payments.js` / `refunds.js`: refusal and refund notices now also reach payers with no account.
- Journeys 13, 15 and 16 (browser) had stale expectations after the earlier layout changes; updated in v39.

## Tests
- `backend/test/api/consultancy-research.test.mjs` (16), `backend/test/api/analytics.test.mjs` (8).
- Browser journeys 18 (consultancy end to end, a guest), 19 (research internal), 20 (analytics drill-down, Excel, report).
- Full run: 174 API tests, 4 Python suites, pool guard, 38 browser runs (desktop and phone), all passing.

## Assumptions to confirm
- Consultancy fee is set per request by the admin (no fixed price list). Minimum paid fee is NGN 100; 0 means free.
- A paid, scheduled consultancy is not cancelled in the TRC screen; use the Refund room (which then cancels the session).
- A repeat request (same email or phone, same service or topic, still open within 30 days) is refused with a pointer to the existing one.
- Applicants who gave only a phone number are asked for an email once, at payment (Paystack needs one).
- Analytics location filters match the farmer's registered state/LGA/ward/unit text exactly (the drop-downs only offer values that exist).
