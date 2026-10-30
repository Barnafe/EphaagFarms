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
  subject: "Your payment could not be used",
  title: "Payment not applied",
  html: `<p>We received your payment of ${naira(d.amount)} (reference ${escapeHtml(d.reference)}) but could not use it because ${escapeHtml(d.reasonText)}.</p>
<p>Nothing has been ordered or unlocked with this payment. Our administrators have been told and will return the money to your original payment method; you will get another message when they do. Your bank may take a few days to show it.</p>`,
  sms: `EPHAAG: your payment of ${naira(d.amount)} could not be applied. Our team has been told and will return it. Ref ${d.reference}.`,
}), { amount: 50000, reference: "OPR-1", reasonText: "the order had already expired" });

registerTemplate("payment_attention", (d) => ({
  subject: `[Needs attention] ${d.typeLabel} payment could not be applied: ${naira(d.amount)}`,
  title: "A payment needs your attention",
  html: `<p>The system rejected a ${escapeHtml(d.typeLabel)} payment because ${escapeHtml(d.reasonText)}. Nothing was applied and the payer has been told.</p>
<table role="presentation">${row("Payer", d.payer)}${row("Amount", naira(d.amount))}${row("Reference", d.reference)}</table>
<p>Open the <strong>Refund room</strong> (Admin &rarr; Refund room &rarr; Needs attention) to return the money to the payer.</p>`,
  sms: `EPHAAG: a ${d.typeLabel} payment of ${naira(d.amount)} could not be applied and needs a refund. Open Admin > Refund room.`,
}), { typeLabel: "Order", payer: "Amina", amount: 50000, reference: "OPR-1", reasonText: "the order had already expired" });

registerTemplate("refund_sent", (d) => ({
  subject: `Your refund of ${naira(d.amount)} is on its way`,
  title: "Refund started",
  html: `<p>Hi ${escapeHtml(d.name)}, we have started a refund of ${naira(d.amount)} for payment ${escapeHtml(d.reference)}.</p>
<p>Reason: ${escapeHtml(d.reason)}</p><p>It goes back to your original payment method. Your bank may take a few days to show it.</p>`,
  sms: `EPHAAG: refund of ${naira(d.amount)} started for payment ${d.reference}. It returns to your original payment method.`,
}), { name: "Amina", amount: 50000, reference: "OPR-1", reason: "Goods delivered did not match the order" });

registerTemplate("manual_confirmation_notice", (d) => ({
  subject: "[Needs attention] An NYSC AGROALLIED SAED payment was confirmed by hand",
  title: "Confirmed without Paystack",
  html: `<p>Paystack could not be reached, so a NYSC AGROALLIED SAED access-fee payment was confirmed by hand.</p>
<table role="presentation">${row("Member", d.member)}${row("Reference", d.reference)}${row("Reason given", d.reason)}</table>
<p>It is flagged for review. If Paystack later reports the same payment it will not be credited twice.</p>`,
}), { member: "Chidi", reference: "CPAY-1", reason: "Transfer TRF-1" });

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
<table role="presentation">${row("Purchase", d.reference)}${row("Shares", `${d.quantity} × ₦25,000`)}${row("Share capital", naira(d.goodsTotal))}${d.lateFee > 0 ? row(`Late fee (${d.lateDays} day${d.lateDays === 1 ? "" : "s"} late)`, naira(d.lateFee)) : ""}${d.fee > 0 ? row("Payment processing fee", naira(d.fee)) : ""}${row("Total paid", naira(d.amountCharged))}${row("Payment reference", d.paymentReference)}</table>
<p>Keep this email as your receipt. Each share earns its own interest; see them under Savings in your Farmer's Room. Your share capital is exactly ${naira(d.goodsTotal)}; any late fee is not part of it.</p>`,
  sms: `EPHAAG: payment of ${naira(d.amountCharged)} received. ${d.quantity} share${Number(d.quantity) === 1 ? " is" : "s are"} now active. Ref ${d.reference}.`,
}), { name: "Amina", reference: "SPR-20261024-ABCD", quantity: 2, goodsTotal: 50000, fee: 839.2, amountCharged: 50839.2, paymentReference: "SPR-20261024-ABCD" });

registerTemplate("corps_receipt", (d) => ({
  subject: `EPHAAG Farms — payment received (${d.reference})`,
  title: "Payment received",
  html: `<p>Hello ${escapeHtml(d.name)}, we have received your one-time access fee. Your NYSC AGROALLIED SAED training is now unlocked: sign in and open <em>My Training</em> to begin.</p>
<table role="presentation">${row("Access fee", naira(d.accessFee))}${d.fee > 0 ? row("Payment processing fee", naira(d.fee)) : ""}${row("Total paid", naira(d.totalCharged))}${row("Receipt reference", d.reference)}</table>
<p>This fee is non-refundable once paid.</p>`,
  sms: `EPHAAG: payment of ${naira(d.totalCharged)} received. Your NYSC AGROALLIED SAED training is unlocked. Ref ${d.reference}.`,
}), { name: "Chidi", accessFee: 5000, fee: 100, totalCharged: 5100, reference: "CPAY-20261024-ABCD" });

registerTemplate("share_late_started", (d) => ({
  subject: "Your share payment is overdue: a late fee now applies",
  title: "Late fee applies to your share purchase",
  html: `<p>Hi ${escapeHtml(d.name)}, your purchase ${escapeHtml(d.reference)} of ${escapeHtml(d.quantity)} share${Number(d.quantity) === 1 ? "" : "s"} is still unpaid.</p>
<p>A late fee of ${escapeHtml(d.percent)}% of the share amount per month now applies, worked out per day. After one month it stops growing. You can still pay at any time (you will see the exact amount and agree before paying).</p>
<table role="presentation">${row("Share amount", naira(d.total))}${row("Late fee so far", naira(d.lateFee))}${row("Fee stops growing on", d.feeStopsAt)}</table>
<p><strong>Important:</strong> if the purchase is still unpaid ${escapeHtml(d.graceDays)} days after the fee stops growing (${escapeHtml(d.closesAt)}), the share will be completely taken down.</p>`,
  sms: `EPHAAG: your share payment ${d.reference} is overdue. A late fee applies (₦${d.lateFee} so far). Pay in the app. Unpaid shares are taken down on ${d.closesAt}.`,
}), { name: "Amina", reference: "SPR-1", quantity: 2, percent: 2, total: 50000, lateFee: 33.33, feeStopsAt: "30 Nov 2026", graceDays: 10, closesAt: "10 Dec 2026" });

registerTemplate("share_grace_started", (d) => ({
  subject: "Final period: pay your share or it will be taken down",
  title: "Your share is in its grace period",
  html: `<p>Hi ${escapeHtml(d.name)}, the late fee on purchase ${escapeHtml(d.reference)} has stopped growing and is now fixed at ${naira(d.lateFee)}.</p>
<p>You have <strong>${escapeHtml(d.graceDays)} days, until ${escapeHtml(d.closesAt)}</strong>, to pay ${naira(d.amountDue)} (share ${naira(d.total)} + late fee ${naira(d.lateFee)}) and keep your share. <strong>After that the share will be completely taken down and lost.</strong></p>`,
  sms: `EPHAAG: pay ₦${d.amountDue} for share ${d.reference} by ${d.closesAt} or it will be taken down completely.`,
}), { name: "Amina", reference: "SPR-1", total: 50000, lateFee: 1000, amountDue: 51000, graceDays: 10, closesAt: "10 Dec 2026" });

registerTemplate("share_final_warning", (d) => ({
  subject: "Last days: your share will be taken down",
  title: "Your share will be taken down soon",
  html: `<p>Hi ${escapeHtml(d.name)}, purchase ${escapeHtml(d.reference)} is still unpaid. On <strong>${escapeHtml(d.closesAt)}</strong> it will be completely taken down and cannot be recovered. Pay ${naira(d.amountDue)} in the app before then to keep it.</p>`,
  sms: `EPHAAG: LAST WARNING. Share ${d.reference} is taken down on ${d.closesAt} unless you pay ₦${d.amountDue}.`,
}), { name: "Amina", reference: "SPR-1", amountDue: 51000, closesAt: "10 Dec 2026" });

registerTemplate("share_taken_down", (d) => ({
  subject: "Your unpaid share purchase has been taken down",
  title: "Share taken down",
  html: `<p>Hi ${escapeHtml(d.name)}, purchase ${escapeHtml(d.reference)} (${escapeHtml(d.quantity)} share${Number(d.quantity) === 1 ? "" : "s"}) was not paid within the grace period and has been completely taken down. You can start a new purchase at any time.</p>`,
  sms: `EPHAAG: unpaid share purchase ${d.reference} has been taken down. You can start a new purchase any time.`,
}), { name: "Amina", reference: "SPR-1", quantity: 2 });

registerTemplate("investment_receipt", (d) => ({
  subject: `Investment payment received: ${d.reference}`,
  title: "Payment received",
  html: `<p>Hi ${escapeHtml(d.name)}, we received your investment payment${d.autoCharged ? " (charged automatically to your saved card)" : ""}.</p>
<table role="presentation">${row("Investment", d.reference)}${row(d.kind === "activation" ? "Payment for" : "Month", d.kind === "activation" ? (d.planType === "bulk" ? "One-time investment" : "First monthly payment") : d.dueDate)}${row("Amount", naira(d.amount))}${d.fee > 0 ? row("Payment processing fee", naira(d.fee)) : ""}${row("Total paid", naira(d.totalCharged))}${row("Payment reference", d.paymentReference)}</table>
<p>Keep this email as your receipt.</p>`,
  sms: `EPHAAG: payment of ${naira(d.totalCharged)} received for investment ${d.reference}. Ref ${d.paymentReference}.`,
}), { name: "Aliyu", reference: "INV-20261028-ABCD", kind: "monthly", planType: "monthly", dueDate: "2026-11-28", amount: 10000, fee: 250, totalCharged: 10250, paymentReference: "IPR-1", autoCharged: false });

registerTemplate("investment_payment_requested", (d) => ({
  subject: `Your investment ${d.reference} is approved: pay to activate it`,
  title: "Pay to activate your investment",
  html: `<p>Hi ${escapeHtml(d.name)}, your signed agreement has been approved. Your investment becomes active as soon as you pay ${d.planType === "bulk" ? "the one-time amount" : "your first monthly payment"} of ${naira(d.amount)} (plus Paystack's processing fee) through your Investor Room.</p>`,
  sms: `EPHAAG: your investment ${d.reference} is approved. Pay ${naira(d.amount)} in your Investor Room to activate it.`,
}), { name: "Aliyu", reference: "INV-1", planType: "bulk", amount: 100000 });

registerTemplate("investment_auto_charge_failed", (d) => ({
  subject: `We could not charge your card for investment ${d.reference}`,
  title: "Automatic payment failed",
  html: `<p>Hi ${escapeHtml(d.name)}, the automatic charge of ${naira(d.amount)} for your payment due ${escapeHtml(d.dueDate)} did not go through (${escapeHtml(d.error)}). We will not try again automatically.</p>
<p>Please open your Investor Room and use <strong>Pay now</strong> as soon as you can to stay in good standing.</p>`,
  sms: `EPHAAG: automatic charge of ${naira(d.amount)} failed for investment ${d.reference}. Please use Pay now in your Investor Room.`,
}), { name: "Aliyu", reference: "INV-1", amount: 10000, dueDate: "2026-11-28", error: "Insufficient funds" });

registerTemplate("investment_auto_charge_failed_finance", (d) => ({
  subject: `[Finance] Automatic investment charge failed: ${d.reference}`,
  title: "Automatic charge failed",
  html: `<p>The automatic charge for an investor's monthly payment failed. The investor has been told to use Pay now; there is no automatic retry.</p>
<table role="presentation">${row("Investor", d.investor)}${row("Investment", d.reference)}${row("Amount", naira(d.amount))}${row("Due date", d.dueDate)}${row("Reason", d.error)}</table>`,
}), { investor: "Aliyu", reference: "INV-1", amount: 10000, dueDate: "2026-11-28", error: "Insufficient funds" });

registerTemplate("investment_offline_notice", (d) => ({
  subject: "[Needs attention] An investment payment was recorded by hand",
  title: "Investment payment recorded without Paystack",
  html: `<p>An admin recorded an investment payment received outside Paystack (for example a bank transfer). It is flagged for review.</p>
<table role="presentation">${row("Investor", d.investor)}${row("Investment", d.reference)}${row("Amount", naira(d.amount))}${row("Reason given", d.reason)}</table>`,
}), { investor: "Aliyu", reference: "INV-1", amount: 10000, reason: "Bank transfer TRF-1" });

registerTemplate("investment_due_reminder", (d) => ({
  subject: `Reminder: your investment payment of ${naira(d.amount)} is due ${d.dueDate}`,
  title: "Investment payment due soon",
  html: `<p>This is a reminder that your payment of <strong>${naira(d.amount)}</strong> on investment <strong>${escapeHtml(d.reference)}</strong> is due on <strong>${escapeHtml(d.dueDate)}</strong>.</p>
${d.auto ? `<p>It will be charged automatically to your saved card ending ${escapeHtml(d.last4)}. Please make sure the card has enough funds.</p>` : "<p>Open your Investor Room and use <strong>Pay now</strong>.</p>"}
<p><strong>Warning:</strong> after the due date, a penalty of ${d.percent}% of the share's capital (${naira(d.penalty)}) is charged for each month it stays unpaid, and it is deducted from your ROI payout.</p>`,
  sms: `EPHAAG: your investment payment of ${naira(d.amount)} (${d.reference}) is due ${d.dueDate}. If unpaid, a ${d.percent}% penalty (${naira(d.penalty)}) per month is deducted from your ROI.`,
}), { reference: "INV-1", amount: 10000, dueDate: "2026-11-28", percent: 2, penalty: 200, auto: false, last4: "" });

registerTemplate("investment_overdue_notice", (d) => ({
  subject: `Overdue: investment payment of ${naira(d.amount)} (${d.daysLate} day${d.daysLate === 1 ? "" : "s"} late)`,
  title: "Your investment payment is overdue",
  html: `<p>Your payment of <strong>${naira(d.amount)}</strong> on investment <strong>${escapeHtml(d.reference)}</strong> was due on ${escapeHtml(d.dueDate)} and is now <strong>${d.daysLate} day${d.daysLate === 1 ? "" : "s"} late</strong>.</p>
<p>A penalty of ${d.percent}% of the share's capital (${naira(d.penalty)}) is charged for each month it stays unpaid. Penalties charged on this payment so far: <strong>${naira(d.charged)}</strong>. They are deducted from your ROI payout.</p>
<p>Open your Investor Room and use <strong>Pay now</strong> to stop further penalties.</p>`,
  sms: `EPHAAG: investment payment of ${naira(d.amount)} (${d.reference}) is ${d.daysLate} day(s) overdue. Penalty so far ${naira(d.charged)} (${d.percent}%/month), deducted from your ROI. Pay now in your Investor Room.`,
}), { reference: "INV-1", amount: 10000, dueDate: "2026-11-28", daysLate: 3, percent: 2, penalty: 200, charged: 200 });
