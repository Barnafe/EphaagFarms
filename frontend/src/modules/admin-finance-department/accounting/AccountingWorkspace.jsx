import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  PiggyBank,
  TrendingUp,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  CreditCard,
  Landmark,
  Building2,
  ArrowLeftRight,
  FolderOpen,
  Scale,
  Bell,
  BarChart3,
  ShieldCheck,
  Settings,
} from "lucide-react";
import DeptSectionNav from "../../../components/DeptSectionNav.jsx";
import AccountingDashboardPanel from "./AccountingDashboardPanel.jsx";
import FinancialRequestsPanel from "./FinancialRequestsPanel.jsx";
import ApprovalCenterPanel from "./ApprovalCenterPanel.jsx";
import BudgetManagementPanel from "./BudgetManagementPanel.jsx";
import IncomePanel from "./IncomePanel.jsx";
import ExpensePanel from "./ExpensePanel.jsx";
import PayablesPanel from "./PayablesPanel.jsx";
import ReceivablesPanel from "./ReceivablesPanel.jsx";
import PaymentManagementPanel from "./PaymentManagementPanel.jsx";
import BankCashPanel from "./BankCashPanel.jsx";
import DepartmentMonitoringPanel from "./DepartmentMonitoringPanel.jsx";
import TransactionsPanel from "./TransactionsPanel.jsx";
import DocumentsPanel from "./DocumentsPanel.jsx";
import ReconciliationPanel from "./ReconciliationPanel.jsx";
import AlertsPanel from "./AlertsPanel.jsx";
import ReportsPanel from "./ReportsPanel.jsx";
import AuditPanel from "./AuditPanel.jsx";
import SettingsPanel from "./SettingsPanel.jsx";

// The company's full internal accounting system — Financial Requests ->
// Approval Center -> Budgets -> Income/Expense -> Payables/Receivables ->
// Payments -> Bank & Cash, plus company-wide monitoring, reconciliation,
// alerts, reports, audit trail and settings. Deliberately its own
// top-level tab inside the Finance HOD portal (same "own section, own
// DeptSectionNav" pattern as MaintenanceWorkspace inside
// MaintenanceDepartment) rather than folded into the existing
// Dashboard/Payments/Loans/Settlements/Investments/Savings tabs, which
// stay exactly as they were — this is the separate, much bigger
// company-accounting side of Finance, not a replacement for the
// marketplace-facing side.
const sections = [
  { key: "dashboard", label: "Finance Dashboard", icon: LayoutDashboard, description: "Cash position, budgets, pending items, alerts — all at a glance." },
  { key: "requests", label: "Financial Requests", icon: FileText, description: "New requests, department requests, and their status." },
  { key: "approvals", label: "Approval Center", icon: CheckSquare, description: "Approve, reject, return, or escalate pending requests." },
  { key: "budgets", label: "Budget Management", icon: PiggyBank, description: "Company, department, project, operational and capital budgets." },
  { key: "income", label: "Income / Revenue", icon: TrendingUp, description: "Customer payments, sales revenue, and other income." },
  { key: "expenses", label: "Expense Management", icon: Receipt, description: "Department, employee, operational and capital expenses." },
  { key: "payables", label: "Accounts Payable", icon: ArrowUpCircle, description: "Supplier invoices and contractor bills owed by the company." },
  { key: "receivables", label: "Accounts Receivable", icon: ArrowDownCircle, description: "Customer invoices owed to the company." },
  { key: "payments", label: "Payment Management", icon: CreditCard, description: "The full lifecycle from payment request to completion." },
  { key: "bank-cash", label: "Bank & Cash Management", icon: Landmark, description: "Accounts, deposits, withdrawals, and transfers." },
  { key: "monitoring", label: "Department Monitoring", icon: Building2, description: "Spending and budgets broken down by department." },
  { key: "transactions", label: "Financial Transactions", icon: ArrowLeftRight, description: "Every posting — income, expense, payment, transfer, refund, adjustment." },
  { key: "documents", label: "Invoices & Documents", icon: FolderOpen, description: "Invoices, receipts, vouchers, notes, and contracts on file." },
  { key: "reconciliation", label: "Reconciliation", icon: Scale, description: "Bank, cash, supplier, customer, and department reconciliation." },
  { key: "alerts", label: "Financial Alerts", icon: Bell, description: "Low cash, budget thresholds, overdue invoices, and more." },
  { key: "reports", label: "Financial Reports", icon: BarChart3, description: "Income statement, cash position, and payables/receivables reports." },
  { key: "audit", label: "Audit & Compliance", icon: ShieldCheck, description: "The full approval and transaction trail." },
  { key: "settings", label: "Finance Settings", icon: Settings, description: "Categories, budget/approval/payment rules, tax, currency, limits." },
];

// initialSection: lets a caller (e.g. the admin dashboard's "View all" /
// summary-card links) drop straight into a specific accounting section
// instead of landing on the section-picker grid — see FinanceDepartment.jsx,
// which reads this from the ?section= URL param.
export default function AccountingWorkspace({ initialSection = null }) {
  const [section, setSection] = useState(initialSection);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Finance</p>
        <h1 className="text-xl font-medium text-white">Accounting</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Request → approve → budget → record → pay → reconcile → report, company-wide.
        </p>
      </div>

      <DeptSectionNav sections={sections} activeKey={section} onSelect={setSection} deptLabel="accounting sections" />

      {section === "dashboard" && <AccountingDashboardPanel onNavigate={setSection} />}
      {section === "requests" && <FinancialRequestsPanel />}
      {section === "approvals" && <ApprovalCenterPanel />}
      {section === "budgets" && <BudgetManagementPanel />}
      {section === "income" && <IncomePanel />}
      {section === "expenses" && <ExpensePanel />}
      {section === "payables" && <PayablesPanel />}
      {section === "receivables" && <ReceivablesPanel />}
      {section === "payments" && <PaymentManagementPanel />}
      {section === "bank-cash" && <BankCashPanel />}
      {section === "monitoring" && <DepartmentMonitoringPanel />}
      {section === "transactions" && <TransactionsPanel />}
      {section === "documents" && <DocumentsPanel />}
      {section === "reconciliation" && <ReconciliationPanel />}
      {section === "alerts" && <AlertsPanel />}
      {section === "reports" && <ReportsPanel />}
      {section === "audit" && <AuditPanel />}
      {section === "settings" && <SettingsPanel />}
    </div>
  );
}
