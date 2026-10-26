import { registerTemplate, escapeHtml } from "./messageTemplates.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const row = (a, b) => `<tr><td style="padding:4px 12px 4px 0;color:#57534e;">${escapeHtml(a)}</td><td style="padding:4px 0;"><strong>${escapeHtml(b)}</strong></td></tr>`;

registerTemplate("order_receipt", (d) => ({
  subject: `Payment received — order ${d.reference}`,
  title: "Payment received",
  html: `<p>Hi ${escapeHtml(d.name)}, thank you. We have received your payment and your order is confirmed.</p>
<table role="presentation">${row("Order", d.reference)}${row("Goods", naira(d.goodsTotal))}${d.fee > 0 ? row("Payment processing fee", naira(d.fee)) : ""}${row("Total paid", naira(d.amountCharged))}${row("Delivery to", d.deliveryLocation)}${row("Payment reference", d.paymentReference)}</table>
<p>Keep this email as your receipt.</p>`,
  sms: `EPHAAG: payment of ${naira(d.amountCharged)} received for order ${d.reference}. Thank you.`,
}), { name: "Amina", reference: "ORD-20261024-ABCD", goodsTotal: 50000, fee: 839.2, amountCharged: 50839.2, deliveryLocation: "Bauchi", paymentReference: "OPR-20261024-ABCDXYZ" });

registerTemplate("payment_finance_notice", (d) => ({
  subject: `[Finance] ${d.typeLabel} payment received: ${naira(d.netAmount)}`,
  title: `${d.typeLabel} payment received`,
  html: `<p>A Paystack payment was confirmed automatically and is waiting to be recorded in the accounts.</p>
<table role="presentation">${row("Type", d.typeLabel)}${row("Payer", d.payer)}${row("Amount (net to EPHAAG)", naira(d.netAmount))}${row("Processing fee paid by payer", naira(d.fee))}${row("Total charged", naira(d.grossAmount))}${row("Reference", d.reference)}${d.review ? row("Flag", "Review only: " + d.review) : ""}</table>
<p>Open Finance &rarr; Payment confirmations to tick it as recorded.</p>`,
}), { typeLabel: "Order", payer: "Amina", netAmount: 50000, fee: 839.2, grossAmount: 50839.2, reference: "OPR-1", review: "" });

registerTemplate("payment_refused", (d) => ({
  subject: "Your payment could not be used and will be returned",
  title: "Payment not applied",
  html: `<p>We received your payment of ${naira(d.amount)} (reference ${escapeHtml(d.reference)}) but could not use it because ${escapeHtml(d.reasonText)}.</p>
<p>Nothing has been ordered with this payment, and it will be returned to your original payment method. Your bank may take a few days to show it. If you still want the goods, please place the order again.</p>`,
  sms: `EPHAAG: your payment of ${naira(d.amount)} could not be applied and will be returned to you. Ref ${d.reference}.`,
}), { amount: 50000, reference: "OPR-1", reasonText: "the order had already expired" });

registerTemplate("refund_due_notice", (d) => ({
  subject: `[Finance] Refund due: ${naira(d.amount)}`,
  title: "A payment was refused automatically",
  html: `<p>A ${escapeHtml(d.typeLabel)} payment could not be used and was refused by the system: ${escapeHtml(d.reasonText)}.</p>
<table role="presentation">${row("Payer", d.payer)}${row("Amount", naira(d.amount))}${row("Reference", d.reference)}</table>
<p>The payer has been told. Open Finance &rarr; Payment confirmations &rarr; Refunds due to refund it (or it is returned automatically if automatic refunds are switched on).</p>`,
}), { typeLabel: "Order", payer: "Amina", amount: 50000, reference: "OPR-1", reasonText: "the order had already expired" });

registerTemplate("order_expired", (d) => ({
  subject: `Your order ${d.reference} expired`,
  title: "Order expired",
  html: `<p>Hi ${escapeHtml(d.name)}, we did not receive payment for order <strong>${escapeHtml(d.reference)}</strong> within ${escapeHtml(d.hours)} hours, so it has expired. You can place the order again any time.</p>`,
}), { name: "Amina", reference: "ORD-1", hours: 24 });

registerTemplate("commitment_receipt", (d) => ({
  subject: "Standing commitment funded",
  title: "Standing commitment funded",
  html: `<p>Hi ${escapeHtml(d.name)}, we received your payment and ${naira(d.amount)} has been added to your standing commitment balance. You can now place orders against it with no processing fee.</p>`,
  sms: `EPHAAG: ${naira(d.amount)} added to your standing commitment balance.`,
}), { name: "Amina", amount: 500000 });

registerTemplate("share_receipt", (d) => ({
  subject: `Shares purchased — ${d.reference}`,
  title: "Your shares are active",
  html: `<p>Hi ${escapeHtml(d.name)}, we received your payment and your ${escapeHtml(d.quantity)} share${Number(d.quantity) === 1 ? " is" : "s are"} now active.</p>
<table role="presentation">${row("Purchase", d.reference)}${row("Shares", `${d.quantity} × ₦25,000`)}${row("Share capital", naira(d.goodsTotal))}${d.fee > 0 ? row("Payment processing fee", naira(d.fee)) : ""}${row("Total paid", naira(d.amountCharged))}${row("Payment reference", d.paymentReference)}</table>
<p>Keep this email as your receipt. Each share earns its own interest; see them under Savings in your Farmer's Room.</p>`,
  sms: `EPHAAG: payment of ${naira(d.amountCharged)} received. ${d.quantity} share${Number(d.quantity) === 1 ? " is" : "s are"} now active. Ref ${d.reference}.`,
}), { name: "Amina", reference: "SPR-20261024-ABCD", quantity: 2, goodsTotal: 50000, fee: 839.2, amountCharged: 50839.2, paymentReference: "SPR-20261024-ABCD" });
