# Phases 12 and 13: Transport and Maintenance, and Corps Learning

Built on the zip you uploaded (named v40, it already held Phases 10 and 11 and the v39 corrections). Migrations: `018_transport_fleet.sql` and `019_corps_lesson_tracking.sql` (both safe to run on every boot).

## Phase 12: Transport and Maintenance

### Agreed decisions (22 Oct 2026)
1. Transport has a **fleet** (vehicles, drivers, trips, fuel and costs) and **delivery tracking**.
2. Proof of delivery is a **photo with the recipient's name**, a **delivery code**, and **GPS**.
3. **Maintenance is connected**: a vehicle breakdown creates a maintenance request. **Parts and costs follow the budget rules.**

### How it works
- **Fleet.** The Transport office adds vehicles (plate number, type, capacity, odometer). Each vehicle also appears in Maintenance as an asset (type Vehicle), so servicing and faults are tracked there. Drivers are the existing transporter accounts; the office can keep licence number and expiry. An expired licence blocks a driver from being given a trip.
- **Trips.** A trip is one vehicle, one driver and one or more ready orders (up to 25). Creating it puts the orders in transit and the vehicle on a trip. A vehicle or driver cannot be double booked. A trip that has not started can be cancelled (its orders return to the dispatch queue). The driver starts the trip (picks up every order, optional odometer), delivers each order, then finishes the trip (the vehicle becomes available and its odometer moves on).
- **Delivery code.** Each order on a trip gets a random 6 digit code. The buyer gets it by email and SMS (and the delivery contact on the order, if different), and sees it in Order history until the goods are delivered. The code is never sent to the driver or shown to the office. Five wrong entries lock that delivery and tell the office.
- **Proof of delivery.** The driver enters the code, the recipient's name, takes a photo (stored privately; the buyer and the office can open it) and the phone's GPS position is captured. If the phone cannot give a position the driver must write why, and the office is told.
- **Office override.** For a locked delivery (or a recipient who lost the code) the office can record the delivery with a written reason (at least 10 characters). It is kept on the shipment.
- **Breakdown.** The driver taps "Vehicle broke down" on a trip that is under way. The trip becomes broken down, the vehicle goes to in maintenance, and an **urgent maintenance request** is created already approved and linked to the vehicle and the trip (Maintenance sees it marked as a breakdown). The office is emailed with the driver's position. The office then sends a **rescue trip** (another vehicle and driver) which takes over the undelivered orders with the same codes. When Maintenance completes the repair work order, the vehicle is **available again** and the breakdown is marked resolved.
- **Costs and the budget rule.** Fuel (with litres), tolls, allowances and other costs are recorded by the office or by the driver on their own trip. Maintenance costs (labour, parts, contractor, other) are recorded as before. Both count against their department's yearly budget (set by Finance in Purchasing), together with approved purchase orders. A cost that would take the department over its budget is **recorded but held**: it does not count, Finance (the Finance head, or the main admin) is told, and decides with a written reason (approve over budget or reject). Rejected costs are left out of totals and reports. Parts bought into stock are a Maintenance cost (quantity times the price paid) unless the person says they came from a Purchasing order (already counted there).
- **Fleet report.** Per vehicle and year: trips, kilometres, fuel litres and cost, total cost, cost per km, breakdowns.

### Assumptions I applied (tell me if wrong)
- A breakdown request is created **already approved** (urgent), skipping the cross-department approval step, so Maintenance can open a work order at once.
- A held cost is still **recorded** (the fuel is already bought, the parts already arrived); only its counting waits for Finance. Nothing is physically blocked.
- Maintenance and Transport spending count in the year of the cost's date.
- Five wrong codes lock a delivery; the delivery code is 6 digits; a trip carries at most 25 orders.
- The delivery contact on the order (email or phone) also receives the code when it differs from the buyer's own.
- An order that was already in transit before this build (old one-order shipments) has no code; the office can still use "Record delivery without the code" for those.

### API (all under `/api/transport`)
Office (admin): `GET /dashboard`, `GET /queue`, `GET|POST /vehicles`, `PATCH /vehicles/:id`, `GET /drivers`, `PUT /drivers/:id/profile`, `GET|POST /trips`, `POST /trips/:id/cancel`, `POST /trips/:id/rescue`, `POST /shipments/:id/override-delivery`, `GET|POST /costs`, `POST /costs/:id/budget-decision` (Finance), `GET /reports/fleet`.
Driver (transporter): `GET /trips/me`, `POST /trips/:id/start|complete|breakdown`, `POST /costs/me`, `POST /shipments/:id/deliver` (multipart: `photo`, `code`, `recipientName`, `lat`, `lng`, `accuracy` or `gpsMissingReason`).
Maintenance: `POST /api/maintenance/expenses/:id/budget-decision` (Finance); `POST /api/maintenance/parts/:id/adjust` now takes `unitCost` and `fromPurchaseOrder`. Buyer: `GET /api/orders/me` now includes `delivery` per order.

## Phase 13: Corps learning

### Agreed decisions (22 Oct 2026)
1. Live-session attendance **stays as it is** (the member taps complete once it has started).
2. **Recorded video lessons track watch time on embedded videos; document lessons require a minimum time open.**
3. Quiz rules **stay as they are** (unlimited retakes, no reshuffling of questions).

### How it works
- **Videos.** The admin must enter the video's length (minutes and seconds). A YouTube or Vimeo link plays inside our page; while it is really playing (and the page is showing) the screen reports "still here" every 10 seconds. A member must watch **80 percent** of the length before the lesson can be marked complete.
- **Documents.** The admin may set a minimum time open (5 seconds to 1 hour; 60 seconds if left empty). Time counts while the lesson is open on a visible screen.
- **The server keeps the clock.** It adds only the real time between two reports (never more than 15 seconds per report, nothing for a gap longer than 30 seconds, nothing while paused or hidden). Sending reports faster does not speed it up. Marking complete before the time is met is refused with `LESSON_TIME_NOT_MET` and the seconds still to go.
- **History is kept.** Lessons already completed stay completed, even if the admin later changes the length. Time spent has no link to the lesson row, like the rest of a member's history.
- **Live sessions and quizzes are unchanged.**
- The member's lesson list shows a progress bar and the time counted; the admin's lesson form has the new length and minimum time fields and shows each lesson's rule.

### Assumptions I applied (tell me if wrong)
- The **80 percent** share is a fixed rule (not set per lesson).
- A video link that is **not** YouTube or Vimeo cannot be watched inside our page, so it falls back to "this page must stay showing" time. Time cannot be counted reliably while the member watches on another site, so use YouTube or Vimeo for tracked videos (the admin form says so).
- A video lesson made before this build has no length: it uses the length the member's player reports (never less than 60 seconds), or 120 seconds if nothing is known. Admins should edit those lessons and enter the length (the lesson list says "Length not set").
- Watching at higher speed is counted by real clock time while playing, so it is stricter, not easier.

### Test-only switch
`CORPS_LESSON_TIME_CHECK=off` turns the time check off for test runs; it is **ignored in production** and the preflight warns if it is set there. The two older Python corps suites do not use it: they seed the time up front.

## Tests added
- `backend/test/api/transport-fleet.test.mjs` (19 tests: access, vehicles, licences, dispatch, codes, proof, lock and override, trips, breakdown and rescue, repair returns the vehicle, costs and budget decisions, driver costs, Maintenance budget and parts, fleet report).
- `backend/test/api/corps-lesson-time.test.mjs` (11 tests) and `backend/test/lessonTime.test.mjs` (5 unit tests).
- Browser journeys 17 (transport end to end with buyer code, driver proof and GPS) and 18 (corps document timing), on desktop and phone.
- A stale consultancy assertion from the merge was fixed (the email intentionally no longer shows a gateway total).
