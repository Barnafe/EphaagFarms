import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as fd from "../controllers/financeDeptController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// 1. Dashboard + Alerts
router.get("/dashboard", fd.dashboardSummary);
router.get("/alerts", fd.listAlerts);
router.post("/alerts/scan", fd.scanAlerts);
router.post("/alerts/:id/read", fd.markAlertRead);

// 2. Financial Requests
router.get("/requests", fd.listRequests);
router.post("/requests", fd.createRequest);
router.get("/requests/:id", fd.getRequest);
router.post("/requests/:id/documents", fd.addRequestDocument);

// 3. Approval Center
router.get("/approvals/pending", fd.listPendingApprovals);
router.post("/requests/:id/decide", fd.decideRequest);
router.get("/approvals/history", fd.listApprovalHistory);
router.get("/approval-rules", fd.listApprovalRules);
router.post("/approval-rules", fd.createApprovalRule);

// 4. Budget Management
router.get("/budgets", fd.listBudgets);
router.post("/budgets", fd.createBudget);
router.patch("/budgets/:id", fd.updateBudget);
router.post("/budgets/:id/adjust", fd.adjustBudget);
router.get("/budgets/:id/adjustments", fd.listBudgetAdjustments);
router.get("/budgets/reports/vs-actual", fd.budgetVsActual);

// 5. Income / Revenue
router.get("/income", fd.listIncome);
router.post("/income", fd.createIncome);

// 6. Expense Management
router.get("/expenses", fd.listExpenses);
router.post("/expenses", fd.createExpense);
router.post("/expenses/:id/verify", fd.verifyExpense);

// 7. Accounts Payable
router.get("/payables", fd.listPayables);
router.post("/payables", fd.createPayable);
router.post("/payables/:id/settle", fd.recordPayableSettlement);

// 8. Accounts Receivable
router.get("/receivables", fd.listReceivables);
router.post("/receivables", fd.createReceivable);
router.post("/receivables/:id/receive", fd.recordReceivablePayment);

// 9. Payment Management
router.get("/payments", fd.listPayments);
router.post("/payments", fd.createPayment);
router.patch("/payments/:id/status", fd.updatePaymentStatus);

// 10. Bank & Cash Management
router.get("/accounts", fd.listAccounts);
router.post("/accounts", fd.createAccount);
router.post("/accounts/:id/deposit", fd.depositToAccount);
router.post("/accounts/:id/withdraw", fd.withdrawFromAccount);
router.post("/accounts/transfer", fd.transferBetweenAccounts);

// 11. Department Financial Monitoring
router.get("/departments/monitoring", fd.departmentMonitoring);

// 12. Financial Transactions
router.get("/transactions", fd.listTransactions);
router.post("/transactions/:id/verify", fd.verifyTransaction);

// 13. Invoices & Documents
router.get("/documents", fd.listDocuments);
router.post("/documents", fd.createDocument);

// 14. Reconciliation
router.get("/reconciliations", fd.listReconciliations);
router.post("/reconciliations", fd.createReconciliation);
router.patch("/reconciliations/:id", fd.updateReconciliation);

// 16. Financial Reports
router.get("/reports/income-statement", fd.incomeStatement);
router.get("/reports/cash-position", fd.cashPositionReport);
router.get("/reports/payables-receivables", fd.payablesReceivablesReport);

// 17. Audit & Compliance
router.get("/audit-log", fd.listAuditLog);

// 19. Finance Settings
router.get("/settings", fd.listSettings);
router.post("/settings", fd.upsertSetting);

export default router;
