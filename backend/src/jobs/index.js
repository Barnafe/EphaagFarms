import { registerJob } from "./runner.js";
import { processQueue } from "../services/messaging.js";
import { purgeExpiredFiles } from "../services/storage.js";
import { runDueDateReminders } from "../controllers/investmentController.js";
import { pool } from "../db/pool.js";
import { expireUnpaidOrders, recheckStuckPayments } from "../services/orderPayments.js";
import { expireSharePurchases } from "../controllers/farmerSharesController.js";

// Every scheduled task is registered here, in one place. Each job processes
// whatever is due when it runs (catch-up) and is safe to run twice.
export function registerAllJobs() {
  registerJob({ name: "message-queue", description: "Send queued emails and SMS, retry failures", every: 1 },
    () => processQueue({ limit: 100 }));

  registerJob({ name: "investment-reminders", description: "Investment payment due-date reminder emails", daily: "08:00" },
    async () => { await runDueDateReminders(); return { ok: true }; });

  registerJob({ name: "expire-unpaid", description: "Expire unpaid orders after their time limit (a payment that did arrive is settled first)", every: 10 },
    ({ now }) => expireUnpaidOrders({ now }));

  registerJob({ name: "expire-share-purchases", description: "Expire unpaid share purchases after their time limit (a payment that did arrive is settled first)", every: 10 },
    ({ now }) => expireSharePurchases({ now }));

  registerJob({ name: "payment-recheck", description: "Ask Paystack about payments stuck as pending (a webhook that never came)", every: 15 },
    () => recheckStuckPayments());

  registerJob({ name: "file-cleanup", description: "Physically remove files deleted more than 30 days ago", daily: "03:00" },
    () => purgeExpiredFiles());

  registerJob({ name: "log-pruning", description: "Trim old job runs, webhook log and sent messages", daily: "03:30" },
    async () => {
      const a = await pool.query(`DELETE FROM job_runs WHERE started_at < now() - interval '90 days'`);
      const b = await pool.query(`DELETE FROM webhook_events WHERE created_at < now() - interval '90 days'`);
      const c = await pool.query(`DELETE FROM messages WHERE status = 'sent' AND created_at < now() - interval '180 days'`);
      return { jobRuns: a.rowCount, webhookEvents: b.rowCount, messages: c.rowCount };
    });
}
