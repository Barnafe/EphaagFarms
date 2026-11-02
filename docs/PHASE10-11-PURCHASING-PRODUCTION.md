# Phases 10 and 11: Purchasing and Production

Built on v40. Migration: `015_purchasing_budgets_production_costs.sql` (safe to run on every boot).

## Phase 10: Purchasing

### Agreed decisions (22 Oct 2026)
1. Attachments are REQUIRED: a quotation before a supplier is selected, an invoice before final payment.
2. Finance sets an annual budget per department. The department is told as soon as its budget is getting low, so it can ask for more (for example through the Requests form). When the budget is used up, the next purchase is blocked pending Finance approval.
3. Approvals are split into separate admin roles per stage: Procurement, Finance, CEO.

### Roles
The role is the department head the main admin appoints on the Positions screen: **Procurement**, **Finance** or **CEO** (CEO is new in the list). One admin holds one role. The **main admin can act in any role**, so a company with only its first admin can still run the pipeline. Every step in the audit trail records the role used (Procurement, Finance, CEO, Main admin, or the requester's department).

| Stage | Role |
|---|---|
| Raise a request | any admin |
| Verify the need (approve/reject), cancel, suppliers, quotations, select supplier, raise the purchase order | Procurement |
| Approve or reject the purchase order | CEO |
| Budget decision when over budget; authorise the initial payment; verify the invoice; final payment; set budgets | Finance |
| Mark delivered, verify goods, resolve a dispute, record the invoice | Procurement |

A wrong role gets `403 WRONG_STAGE_ROLE` naming the role needed. `GET /api/purchasing/me` says who you are in the pipeline; each request shows `waitingFor` (the role it is waiting for). The right role is notified (not every admin).

### Attachments
Stored in the private `purchasing` category (PDF, JPG or PNG). `POST .../quotations` and `POST .../invoice` accept a multipart `file`; `POST .../quotations/:qid/attachment` and `POST .../invoice/attachment` attach one later (Procurement); `GET .../quotations/:qid/file` and `GET .../invoice/file` download (admins only; members cannot reach them, also not through `/api/files/:id`). Selecting a supplier needs the quotation document; verifying an invoice and the final payment need the invoice document.

### Budgets
- `GET /api/purchasing/budgets?year=` lists every department (Store, Production, Maintenance, Transport, Finance, TRC, Procurement, Other) with amount, committed, remaining, percent used. `PUT /api/purchasing/budgets/:department` (Finance) sets `amount` and `warnAtPercent` (default 80).
- What counts as spent: the value of purchase orders the CEO approved in that year, for requests not cancelled. No budget set for a department means no limit.
- Low-budget alert: once, to the department head and Finance, when the percent used reaches the warning level (and a second, different alert when it is used up). Raising the budget re-arms the alerts.
- The hold: when raising a purchase order would overrun the budget, the request moves to `budget_approval_pending` and Finance is told. The CEO cannot act on it. Finance approves over budget (a written note is required) -> back to the CEO; or sends it back -> the order is rejected and the request returns to sourcing. The budget is checked again when the CEO approves, in case other orders were approved meanwhile.
- A rejected order no longer blocks a corrected one (the database now allows one *live* order per request).

## Phase 11: Production

### Agreed decisions
Livestock is tracked simply (livestock harvests only, like crops); Production records costs (inputs, labour, other per farm) so profit per harvest is visible; no annual production targets.

- Farms have a type: `crop` (default) or `livestock`. A livestock harvest is recorded exactly like a crop harvest ("Eggs, 300 crates", "Broilers, 800 birds").
- A harvest can carry what it was worth (`revenue`), at declaration or later (`PATCH /api/production/harvests/:id`).
- Costs: `GET/POST /api/production/costs`, `PATCH/DELETE /api/production/costs/:id`. Category is `inputs`, `labour` or `other`. A cost can be charged to one harvest of the same farm, or left as a general farm cost.
- `GET /api/production/profit?year=` gives profit per harvest (revenue minus the costs charged to it; unknown, not zero, when no revenue is recorded), profit per farm (revenue minus ALL its costs that year, general costs shown separately), costs by type and totals.
- Harvest and cost dates are validated and cannot be in the future; a farm with harvests or costs cannot be deleted.
- Screens: Production > Farms (crop or livestock), Harvests (value of each harvest), new **Costs & profit** tab, dashboard cards (livestock farms, profit this year), Annual summary shows livestock and what it was worth.

## Fixed on the way
- Purchasing built its responses while still holding a database connection, a latent deadlock risk that the pool guard caught; responses now use the held connection and background messages run outside it.
- A rejected purchase order could never be replaced (a database rule allowed only one order per request).
- The pool-guard-safe message drain from v40 is unchanged.

## Tests
`backend/test/api/purchasing.test.mjs` (12), `backend/test/api/production.test.mjs` (8), browser journeys 7 (Purchasing, replaces the placeholder) and 21 (Production). Full run results are in HANDOVER.md.

## Assumptions to confirm
- Money spent against a budget is the approved purchase order value (not the later invoice or payments).
- The department on a purchase request must be one of the eight listed; departments with no budget set are not limited.
- Purchases that were mid-way through the pipeline before v41 keep working; they simply have no documents, which are only required at the next gate (selecting a supplier, verifying the invoice).
- Costs are typed in by Production; they are not pulled automatically from Purchasing.
