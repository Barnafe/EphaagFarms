// Phase 12: messages for dispatch, delivery and breakdowns.
import { registerTemplate, escapeHtml } from "./messageTemplates.js";

registerTemplate("delivery_dispatched", (d) => ({
  subject: `Your order ${d.orderReference} is on its way`,
  title: "Your order is on its way",
  html: `<p>Hello ${escapeHtml(d.name)}, your order ${escapeHtml(d.orderReference)} has been handed to our driver${d.driverName ? ` ${escapeHtml(d.driverName)}` : ""}${d.plate ? ` (vehicle ${escapeHtml(d.plate)})` : ""}.</p>
<p>Your delivery code is <strong style="font-size:20px;letter-spacing:3px;">${escapeHtml(d.code)}</strong>. Give it to the driver only when the goods are in your hands. Keep it private until then.</p>`,
  sms: `EPHAAG: order ${d.orderReference} is on its way. Delivery code ${d.code}. Give it to the driver only when you receive the goods.`,
}), { name: "Amina", orderReference: "ORD-20261101-ABCD", driverName: "Musa", plate: "BAU 123 XY", code: "482913" });

registerTemplate("delivery_completed", (d) => ({
  subject: `Your order ${d.orderReference} was delivered`,
  title: "Your order was delivered",
  html: `<p>Hello ${escapeHtml(d.name)}, order ${escapeHtml(d.orderReference)} was delivered and received by ${escapeHtml(d.recipientName)}.</p>
<p>If this is not right, please contact us as soon as you can.</p>`,
  sms: `EPHAAG: order ${d.orderReference} was delivered, received by ${d.recipientName}. If this is wrong, contact us.`,
}), { name: "Amina", orderReference: "ORD-20261101-ABCD", recipientName: "Aisha Bello" });

registerTemplate("driver_trip_assigned", (d) => ({
  subject: `New trip ${d.tripReference}: ${d.count} ${d.count === 1 ? "order" : "orders"}`,
  title: "You have a new trip",
  html: `<p>Hello ${escapeHtml(d.name)}, trip ${escapeHtml(d.tripReference)} is assigned to you with vehicle ${escapeHtml(d.plate)}, carrying ${d.count} ${d.count === 1 ? "order" : "orders"}.</p><p>Open Transporter's Room &rarr; Trips to start it.</p>`,
  sms: `EPHAAG: new trip ${d.tripReference}, vehicle ${d.plate}, ${d.count} order(s). Open your Trips page to start.`,
}), { name: "Musa", tripReference: "TRP-20261101-ABCD", plate: "BAU 123 XY", count: 2 });

registerTemplate("vehicle_breakdown", (d) => ({
  subject: `[Transport] Breakdown on trip ${d.tripReference} (${d.plate})`,
  title: "A vehicle broke down on a trip",
  html: `<p>${escapeHtml(d.driverName)} reported a breakdown on trip ${escapeHtml(d.tripReference)}, vehicle ${escapeHtml(d.plate)}.</p>
<p><em>${escapeHtml(d.description)}</em></p>
<p>${d.undelivered} ${d.undelivered === 1 ? "order is" : "orders are"} still on the vehicle. A maintenance request (${escapeHtml(d.maintenanceReference)}) was created automatically.${d.mapLink ? ` Last known position: ${escapeHtml(d.mapLink)}` : ""}</p>
<p>Open Transport &rarr; Trips to send another vehicle and driver.</p>`,
}), { tripReference: "TRP-20261101-ABCD", plate: "BAU 123 XY", driverName: "Musa", description: "Engine overheating", undelivered: 2, maintenanceReference: "MREQ-20261101-ABCD", mapLink: "" });

registerTemplate("delivery_code_locked", (d) => ({
  subject: `[Transport] Delivery code locked for ${d.orderReference}`,
  title: "A delivery code was entered wrongly too many times",
  html: `<p>${escapeHtml(d.driverName)} entered a wrong delivery code ${d.attempts} times for order ${escapeHtml(d.orderReference)} (shipment ${escapeHtml(d.shipmentReference)}).</p>
<p>The shipment is locked. Open Transport &rarr; Trips to check with the buyer and, if needed, record the delivery with a written reason.</p>`,
}), { orderReference: "ORD-20261101-ABCD", shipmentReference: "SHP-20261101-ABCD", driverName: "Musa", attempts: 5 });

registerTemplate("delivery_without_gps", (d) => ({
  subject: `[Transport] Delivery of ${d.orderReference} recorded without GPS`,
  title: "A delivery has no GPS position",
  html: `<p>${escapeHtml(d.driverName)} delivered order ${escapeHtml(d.orderReference)} but the phone could not give a position. Reason given: <em>${escapeHtml(d.reason)}</em></p>`,
}), { orderReference: "ORD-20261101-ABCD", driverName: "Musa", reason: "Location is switched off on this phone" });
