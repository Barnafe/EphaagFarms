import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LogIn,
  ClipboardCheck,
  Landmark,
  PiggyBank,
  Sprout,
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  ArrowLeftRight,
  Undo2,
  Scale,
  Building2,
  BarChart3,
  Mail,
  PackagePlus,
  Tag,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { CashFlowChart, SplitDonut, CategoryDonut, FLOW_GREEN, FLOW_RED, GOLD } from "./HomeCharts.jsx";

function naira(n) {
  return `₦${(Number(n) || 0).toLocaleString()}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TXN_META = {
  income: { icon: ArrowDownCircle, color: FLOW_GREEN, verb: "+" },
  refund: { icon: Undo2, color: FLOW_GREEN, verb: "+" },
  expense: { icon: ArrowUpCircle, color: FLOW_RED, verb: "-" },
  payment: { icon: CreditCard, color: FLOW_RED, verb: "-" },
  transfer: { icon: ArrowLeftRight, color: GOLD, verb: "" },
  adjustment: { icon: Scale, color: GOLD, verb: "" },
};

// Admin's home screen — a quick-brief summary of the company's real
// numbers (finance, users, approvals), not another place to explain the
// whole system. Departments are reached via "Login As" (see
// AdminDashboardShell's sidebar), not a grid here — this page answers
// "how's everything doing right now" at a glance, with the key figures
// and lists linking straight through to where the full detail lives.
//
// Redesigned 2026-09-05 to mirror a reference dashboard layout the admin
// supplied (stat tiles -> cash flow / budget / recent activity -> approvals
// / department spend / expense mix -> quick actions), but built entirely
// from this app's own data (finance-department dashboard + analytics
// overview + cross-department requests) rather than placeholder numbers,
// and kept inside the existing green-shell / red-card (.dash-scope) theme
// instead of introducing new colors.
export default function AdminHub() {
  const { session } = useAuth();
  const [overview, setOverview] = useState(null);
  const [finance, setFinance] = useState(null);
  const [awaiting, setAwaiting] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [error, setError] = useState("");
  const [now] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);

      const [ov, fin, awaitingRes, txnsRes, incomeStatementRes] = await Promise.all([
        apiFetch("/analytics/overview"),
        apiFetch("/finance-department/dashboard"),
        apiFetch("/requests/awaiting-me"),
        apiFetch(`/finance-department/transactions?from=${monthStart}&to=${today}`),
        apiFetch("/finance-department/reports/income-statement"),
      ]);

      setOverview(ov);
      setFinance(fin);
      setAwaiting(awaitingRes.requests);

      // Bucket this month's transactions into per-day inflow/outflow for
      // the cash flow chart — income counts as inflow, expense/payment as
      // outflow; transfers/refunds/adjustments are left out of this chart
      // (they're not revenue or spend) but still show in Recent Transactions.
      const byDay = new Map();
      for (const t of txnsRes.transactions) {
        const day = t.transacted_at.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, { inflow: 0, outflow: 0 });
        const bucket = byDay.get(day);
        const amt = Number(t.amount);
        if (t.txn_type === "income") bucket.inflow += amt;
        else if (t.txn_type === "expense" || t.txn_type === "payment") bucket.outflow += amt;
      }
      const days = [...byDay.keys()].sort();
      setCashFlow(
        days.map((d) => ({
          label: new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          inflow: byDay.get(d).inflow,
          outflow: byDay.get(d).outflow,
        }))
      );

      setExpenseCategories(
        (incomeStatementRes.expenses || []).map((e) => ({ key: e.category || "Uncategorized", value: Number(e.total) }))
      );

      setError("");
    } catch (err) {
      setError(err.message || "Could not load your dashboard.");
    }
  }, [now]);

  useEffect(() => {
    load();
  }, [load]);

  const roleCount = (role) => overview?.usersByRole.find((r) => r.role === role)?.count ?? 0;
  const totalUsers = useMemo(() => overview?.usersByRole.reduce((s, r) => s + r.count, 0) ?? 0, [overview]);

  const budgetRemaining = finance ? Math.max(finance.budgetAllocated - finance.budgetSpent, 0) : 0;
  const budgetUtilizationPct = finance && finance.budgetAllocated > 0
    ? Math.round((finance.budgetSpent / finance.budgetAllocated) * 100)
    : 0;

  const maxDeptSpend = useMemo(() => {
    if (!finance?.departmentSpending?.length) return 0;
    return Math.max(...finance.departmentSpending.map((d) => Number(d.total)));
  }, [finance]);

  const loading = !overview && !finance && !error;

  return (
    <AdminDashboardShell>
      <div className="max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
            <h1 className="text-xl font-medium text-white">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
            </h1>
            <p className="mt-1 text-sm text-ink-600">Here's how EPHAAG Farms is doing right now.</p>
          </div>
          <p className="text-xs text-ink-600">
            {now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {error && (
          <div className="card mb-4 border-red-200">
            <p className="text-sm text-white">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-canopy-100">Loading…</p>
        ) : (
          <>
            {/* ---------------- Stat tiles ---------------- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Link to="/admin/finance?tab=accounting&section=bank-cash" className="card transition hover:border-canopy-400 hover:shadow-md">
                <div className="flex items-center gap-2 text-ink-600">
                  <Wallet size={16} />
                  <p className="text-sm">Total cash balance</p>
                </div>
                <p className="mt-1 text-xl font-medium text-white">{naira(finance?.cashPosition)}</p>
              </Link>

              <Link to="/admin/finance?tab=accounting&section=income" className="card transition hover:border-canopy-400 hover:shadow-md">
                <div className="flex items-center gap-2 text-ink-600">
                  <TrendingUp size={16} />
                  <p className="text-sm">Revenue (this month)</p>
                </div>
                <p className="mt-1 text-xl font-medium text-white">{naira(finance?.monthToDateRevenue)}</p>
              </Link>

              <Link to="/admin/finance?tab=accounting&section=expenses" className="card transition hover:border-canopy-400 hover:shadow-md">
                <div className="flex items-center gap-2 text-ink-600">
                  <TrendingDown size={16} />
                  <p className="text-sm">Expenses (this month)</p>
                </div>
                <p className="mt-1 text-xl font-medium text-white">{naira(finance?.monthToDateExpenses)}</p>
              </Link>

              <Link to="/admin/requests" className="card transition hover:border-canopy-400 hover:shadow-md">
                <div className="flex items-center gap-2 text-ink-600">
                  <ClipboardCheck size={16} />
                  <p className="text-sm">Pending approvals</p>
                </div>
                <p className="mt-1 text-xl font-medium text-white">{awaiting.length}</p>
              </Link>

              <Link to="/admin/analytics" className="card transition hover:border-canopy-400 hover:shadow-md">
                <div className="flex items-center gap-2 text-ink-600">
                  <Users size={16} />
                  <p className="text-sm">Platform users</p>
                </div>
                <p className="mt-1 text-xl font-medium text-white">{totalUsers}</p>
                <p className="text-xs text-ink-600">{roleCount("farmer")} farmers · {roleCount("buyer")} buyers</p>
              </Link>
            </div>

            {/* ---------------- Cash flow / Budget / Recent transactions ---------------- */}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="card lg:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Cash flow overview</p>
                  <span className="text-xs text-ink-600">This month</span>
                </div>
                <CashFlowChart data={cashFlow} />
              </div>

              <Link to="/admin/finance?tab=accounting&section=budgets" className="card block transition hover:border-canopy-400 hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Budget utilization</p>
                  <span className="text-xs text-ink-600">Active budgets</span>
                </div>
                <SplitDonut
                  segments={[
                    { key: "Used", value: finance?.budgetSpent ?? 0, color: FLOW_RED },
                    { key: "Remaining", value: budgetRemaining, color: FLOW_GREEN },
                  ]}
                  centerLabel={`${budgetUtilizationPct}%`}
                  centerSubLabel="Utilized"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-ink-600">
                  <span>Spent {naira(finance?.budgetSpent)}</span>
                  <span>Allocated {naira(finance?.budgetAllocated)}</span>
                </div>
              </Link>

              <div className="card">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Recent transactions</p>
                  <Link to="/admin/finance?tab=accounting&section=transactions" className="flex items-center gap-1 text-xs text-canopy-300 hover:text-canopy-200">
                    View all <ArrowRight size={12} />
                  </Link>
                </div>
                {finance?.recentTransactions?.length ? (
                  <ul className="space-y-3">
                    {finance.recentTransactions.slice(0, 5).map((t) => {
                      const meta = TXN_META[t.txn_type] || TXN_META.adjustment;
                      const Icon = meta.icon;
                      return (
                        <li key={t.id} className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20" style={{ color: meta.color }}>
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-white">{t.description || t.reference}</p>
                            <p className="text-xs text-ink-600">{timeAgo(t.transacted_at)}</p>
                          </div>
                          <span className="shrink-0 text-sm font-medium" style={{ color: meta.color }}>
                            {meta.verb}
                            {naira(t.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-600">No transactions recorded yet.</p>
                )}
              </div>
            </div>

            {/* ---------------- Approvals / Department spending / Expense mix ---------------- */}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="card">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Pending approvals</p>
                  <Link to="/admin/requests" className="flex items-center gap-1 text-xs text-canopy-300 hover:text-canopy-200">
                    View all <ArrowRight size={12} />
                  </Link>
                </div>
                {awaiting.length ? (
                  <ul className="space-y-3">
                    {awaiting.slice(0, 4).map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{r.title}</p>
                          <p className="text-xs text-ink-600">{r.department}</p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-600">{timeAgo(r.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-600">Nothing waiting on you right now.</p>
                )}
              </div>

              <Link to="/admin/finance?tab=accounting&section=monitoring" className="card block transition hover:border-canopy-400 hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Department spending</p>
                  <span className="text-xs text-ink-600">This month</span>
                </div>
                {finance?.departmentSpending?.length ? (
                  <ul className="space-y-3">
                    {finance.departmentSpending.slice(0, 5).map((d) => (
                      <li key={d.department}>
                        <div className="mb-1 flex items-center justify-between text-xs text-ink-600">
                          <span className="flex items-center gap-1 text-white"><Building2 size={12} /> {d.department}</span>
                          <span>{naira(d.total)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/25">
                          <div
                            className="h-full rounded-full bg-canopy-300"
                            style={{ width: `${maxDeptSpend > 0 ? (Number(d.total) / maxDeptSpend) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-600">No department spending recorded yet.</p>
                )}
              </Link>

              <Link to="/admin/finance?tab=accounting&section=expenses" className="card block transition hover:border-canopy-400 hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Top expenses by category</p>
                  <span className="text-xs text-ink-600">Year to date</span>
                </div>
                <CategoryDonut data={expenseCategories} />
              </Link>
            </div>

            {/* ---------------- Quick actions ---------------- */}
            <div className="card mt-3">
              <p className="mb-3 text-sm font-medium text-white">Quick actions</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Link to="/admin/add-catalog" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <PackagePlus size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Add catalog item</span>
                </Link>
                <Link to="/admin/add-price" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <Tag size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Add price</span>
                </Link>
                <Link to="/admin/login-as" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <LogIn size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Login as department</span>
                </Link>
                <Link to="/admin/requests" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <ShieldCheck size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Review requests</span>
                </Link>
                <Link to="/admin/analytics" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <BarChart3 size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Analytics & reports</span>
                </Link>
                <Link to="/admin/contact-messages" className="flex flex-col items-center gap-2 rounded-card border border-white/10 p-4 text-center transition hover:border-canopy-400">
                  <Mail size={20} className="text-canopy-300" />
                  <span className="text-xs text-white">Contact messages</span>
                </Link>
              </div>
            </div>

            {/* ---------------- Platform at a glance ---------------- */}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card">
                <div className="flex items-center gap-2 text-ink-600">
                  <PiggyBank size={16} />
                  <p className="text-sm">Total savings</p>
                </div>
                <p className="mt-1 text-lg font-medium text-white">{naira(overview?.totalSavings)}</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 text-ink-600">
                  <Landmark size={16} />
                  <p className="text-sm">Pending loans</p>
                </div>
                <p className="mt-1 text-lg font-medium text-white">
                  {overview?.loansByStatus.find((r) => r.status === "pending")?.count ?? 0}
                </p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 text-ink-600">
                  <Sprout size={16} />
                  <p className="text-sm">Crops declared</p>
                </div>
                <p className="mt-1 text-lg font-medium text-white">{overview?.distinctCropsDeclared}</p>
                <p className="text-xs text-ink-600">from {overview?.farmersWithDeclarations} farmers</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 text-ink-600">
                  <Wallet size={16} />
                  <p className="text-sm">Receivables / Payables</p>
                </div>
                <p className="mt-1 text-sm text-white">
                  {naira(finance?.accountsReceivable)} <span className="text-ink-600">/</span> {naira(finance?.accountsPayable)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminDashboardShell>
  );
}
