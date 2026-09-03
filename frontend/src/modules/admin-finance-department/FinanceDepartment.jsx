import { useCallback, useEffect, useState } from "react";
import { CreditCard, Landmark, Handshake, Tag, TrendingUp, PiggyBank } from "lucide-react";
import { apiFetch, apiDownload } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import PaymentConfirmationPanel from "./PaymentConfirmationPanel.jsx";
import LoanDisbursementPanel from "./LoanDisbursementPanel.jsx";
import FinanceReviewPanel from "./FinanceReviewPanel.jsx";
import BoostDepositReviewPanel from "./BoostDepositReviewPanel.jsx";
import RepaymentReconciliationPanel from "./RepaymentReconciliationPanel.jsx";
import SettlementPanel from "./SettlementPanel.jsx";
import PriceEditorPanel from "./PriceEditorPanel.jsx";
import LoanPipelinePanel from "./LoanPipelinePanel.jsx";
import { ApplicationReviewPanel, PartnerStatusPanel, ROIPayoutPanel } from "./InvestmentPanels.jsx";
import InsuranceApplyControl from "./InsuranceApplyControl.jsx";

function mapLoan(l) {
  return {
    id: l.id,
    status: l.status,
    loanReference: l.reference,
    farmerName: l.farmer_name,
    loanType: l.loan_type,
    amount: Number(l.amount),
    repaymentMonths: l.repayment_months,
    depositRequired: l.deposit_required != null ? Number(l.deposit_required) : null,
    depositPaidAt: l.deposit_paid_at,
    depositVerified: l.deposit_verified,
  };
}

function mapPendingPayment(o) {
  return {
    id: o.id,
    orderReference: o.reference,
    buyerName: o.buyer_name,
    amount: Number(o.total),
    status: "pending",
  };
}
function mapRepayment(r) {
  return {
    loanReference: r.loan_reference,
    farmerName: r.farmer_name,
    amount: Number(r.amount),
    method: r.method,
    date: r.paid_at?.slice(0, 10),
  };
}


const tabs = [
  {
    key: "payments",
    label: "Payment confirmations",
    icon: CreditCard,
    description: "Confirm buyer payments before an order moves to Procurement.",
  },
  {
    key: "loans",
    label: "Loans",
    icon: Landmark,
    description: "Recommend, verify, approve, disburse, and reconcile repayments — the full pipeline.",
  },
  {
    key: "settlements",
    label: "Settlements",
    icon: Handshake,
    description: "Pay farmers for produce sourced from them.",
  },
  {
    key: "prices",
    label: "Prices",
    icon: Tag,
    description: "Set the buy price (farmers) and sell price (buyers) for every crop.",
  },
  {
    key: "investments",
    label: "Investments",
    icon: TrendingUp,
    description: "Review applications, partner-tier reviews, and ROI payouts.",
  },
  {
    key: "savings",
    label: "Savings",
    icon: PiggyBank,
    description: "Farmer savings balances, insurance, and withdrawal requests.",
  },
];

export default function FinanceDepartment() {
  const [tab, setTab] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentError, setPaymentError] = useState(null);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [financeReviewLoans, setFinanceReviewLoans] = useState([]);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [pendingRecommendLoans, setPendingRecommendLoans] = useState([]);
  const [awaitingApprovalLoans, setAwaitingApprovalLoans] = useState([]);
  const [loanError, setLoanError] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [settlementError, setSettlementError] = useState(null);
  const [prices, setPrices] = useState([]);
  const [priceError, setPriceError] = useState(null);
  const [applications, setApplications] = useState([]);
  const [partnerReviews, setPartnerReviews] = useState([]);
  const [roiPayouts, setRoiPayouts] = useState([]);
  const [investmentError, setInvestmentError] = useState(null);
  const [reminderRunning, setReminderRunning] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [savingsFarmers, setSavingsFarmers] = useState([]);
  const [savingsWithdrawals, setSavingsWithdrawals] = useState([]);
  const [savingsError, setSavingsError] = useState(null);

  const loadPayments = useCallback(async () => {
    try {
      const { orders } = await apiFetch("/orders/pending-confirmation");
      setPayments(orders.map(mapPendingPayment));
      setPaymentError(null);
    } catch (err) {
      setPaymentError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "payments") loadPayments();
  }, [tab, loadPayments]);

  const loadLoans = useCallback(async () => {
    try {
      const [
        { loans: awaiting },
        { repayments: unverified },
        { loans: financeReview },
        { deposits: pendingDeposits },
        { loans: pendingRecommend },
        { loans: awaitingApproval },
      ] = await Promise.all([
        apiFetch("/loans/awaiting-disbursement"),
        apiFetch("/loans/repayments/unverified"),
        apiFetch("/loans/finance-review"),
        apiFetch("/loans/boost-deposits/pending"),
        apiFetch("/loans/pending/my-unit"),
        apiFetch("/loans/recommended"),
      ]);
      setLoans(awaiting.map(mapLoan));
      setRepayments(unverified.map(mapRepayment));
      setFinanceReviewLoans(financeReview.map(mapLoan));
      setPendingDeposits(pendingDeposits);
      setPendingRecommendLoans(pendingRecommend.map(mapLoan));
      setAwaitingApprovalLoans(awaitingApproval.map(mapLoan));
      setLoanError(null);
    } catch (err) {
      setLoanError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "loans") loadLoans();
  }, [tab, loadLoans]);

  const loadInvestments = useCallback(async () => {
    try {
      const [{ applications: apps }, { reviews }, { payouts }] = await Promise.all([
        apiFetch("/investments/applications"),
        apiFetch("/investments/partner-reviews"),
        apiFetch("/investments/roi-payouts"),
      ]);
      setApplications(apps);
      setPartnerReviews(reviews);
      setRoiPayouts(payouts);
      setInvestmentError(null);
    } catch (err) {
      setInvestmentError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "investments") loadInvestments();
  }, [tab, loadInvestments]);

  const loadSavings = useCallback(async () => {
    try {
      const { farmers: sf, withdrawals: sw } = await apiFetch("/farmers/admin/savings");
      setSavingsFarmers(sf);
      setSavingsWithdrawals(sw);
      setSavingsError(null);
    } catch (err) {
      setSavingsError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "savings") loadSavings();
  }, [tab, loadSavings]);

  const loadSettlements = useCallback(async () => {
    try {
      const { payments: p } = await apiFetch("/finance/payments/farmers");
      setSettlements(
        p.map((row) => ({
          id: row.id,
          orderReference: row.order_reference,
          farmerName: row.farmer_name,
          amount: Number(row.amount),
          status: row.status,
        }))
      );
      setSettlementError(null);
    } catch (err) {
      setSettlementError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "settlements") loadSettlements();
  }, [tab, loadSettlements]);

  const loadPrices = useCallback(async () => {
    try {
      const { prices: pr } = await apiFetch("/finance/prices");
      setPrices(pr.map((row) => ({ ...row, buy_price: Number(row.buy_price), sell_price: Number(row.sell_price) })));
      setPriceError(null);
    } catch (err) {
      setPriceError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "prices") loadPrices();
  }, [tab, loadPrices]);

  async function handleConfirmPayment(id) {
    try {
      await apiFetch(`/orders/${id}/confirm-payment`, { method: "POST" });
      await loadPayments();
    } catch (err) {
      setPaymentError(err.message);
    }
  }

  async function handleDisburse(id) {
    try {
      await apiFetch(`/loans/${id}/disburse`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleVerifyRepayment(id) {
    try {
      await apiFetch(`/loans/repayments/${id}/verify`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handlePaySettlement(paymentId) {
    try {
      await apiFetch(`/finance/payments/${paymentId}/pay`, { method: "POST" });
      await loadSettlements();
    } catch (err) {
      setSettlementError(err.message);
    }
  }

  async function handleSavePrice(priceId, { buyPrice, sellPrice }) {
    try {
      await apiFetch(`/finance/prices/${priceId}`, { method: "PATCH", body: { buyPrice, sellPrice } });
      await loadPrices();
    } catch (err) {
      setPriceError(err.message);
    }
  }

  async function handleDownloadAgreement(application) {
    try {
      await apiDownload(
        `/investments/applications/${application.id}/agreement`,
        `${application.reference}-signed-agreement.pdf`
      );
    } catch (err) {
      setInvestmentError(err.message);
    }
  }

  async function handleApplicationDecision(id, status) {
    const decision = status === "rejected" ? "reject" : "approve";
    try {
      await apiFetch(`/investments/applications/${id}/decide`, { method: "POST", body: { decision } });
      await loadInvestments();
    } catch (err) {
      setInvestmentError(err.message);
    }
  }

  async function handlePartnerApprove(id) {
    try {
      await apiFetch(`/investments/partner-reviews/${id}/approve`, { method: "POST" });
      await loadInvestments();
    } catch (err) {
      setInvestmentError(err.message);
    }
  }

  async function handleWithdrawalDecision(id, decision) {
    try {
      await apiFetch(`/farmers/admin/savings/withdrawals/${id}/decide`, {
        method: "POST",
        body: { decision },
      });
      await loadSavings();
    } catch (err) {
      setSavingsError(err.message);
    }
  }

  async function handleApplyInsurance(userId, amount, note) {
    try {
      await apiFetch("/farmers/admin/savings/insurance-apply", {
        method: "POST",
        body: { userId, amount, note },
      });
      await loadSavings();
    } catch (err) {
      setSavingsError(err.message);
    }
  }

  async function handleRunReminderCheck() {
    setReminderRunning(true);
    try {
      const result = await apiFetch("/investments/admin/run-reminder-check", { method: "POST" });
      setReminderResult(result);
      setInvestmentError(null);
    } catch (err) {
      setInvestmentError(err.message);
    } finally {
      setReminderRunning(false);
    }
  }

  async function handleVerifyBoostDeposit(id) {
    try {
      await apiFetch(`/loans/boost-deposits/${id}/verify`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleFinanceVerify(id) {
    try {
      await apiFetch(`/loans/${id}/finance-verify`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleFinanceReject(id) {
    try {
      await apiFetch(`/loans/${id}/reject`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleRecommendLoan(id) {
    try {
      await apiFetch(`/loans/${id}/recommend`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleApproveLoan(id) {
    try {
      await apiFetch(`/loans/${id}/approve`, { method: "POST" });
      await loadLoans();
    } catch (err) {
      setLoanError(err.message);
    }
  }

  async function handleRoiApprove(id) {
    try {
      await apiFetch(`/investments/roi-payouts/${id}/approve`, { method: "POST" });
      await loadInvestments();
    } catch (err) {
      setInvestmentError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
        <h1 className="text-xl font-medium text-white">Finance Department</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Payment confirmation, loans, settlements, and investments.
        </p>
      </div>

      <DeptSectionNav sections={tabs} activeKey={tab} onSelect={setTab} deptLabel="Finance sections" />

      {tab === "payments" && (
        <>
          {paymentError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{paymentError}</p>
            </div>
          )}
          <PaymentConfirmationPanel orders={payments} onConfirm={handleConfirmPayment} />
        </>
      )}

      {tab === "loans" && (
        <>
          {loanError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{loanError}</p>
            </div>
          )}
          <p className="text-xs text-ink-600">
            Recommend and final-approval are normally a Unit Leader's and Federal's own rank-gated steps —
            admin can perform them too for now, company-wide, until those roles are staffed.
          </p>
          <LoanPipelinePanel
            title="Recommend (Unit Leader step)"
            blurb="Pending applications, company-wide — normally scoped to one unit leader's own jurisdiction."
            loans={pendingRecommendLoans}
            primaryLabel="Recommend"
            onPrimary={handleRecommendLoan}
            onReject={handleFinanceReject}
          />
          <FinanceReviewPanel loans={financeReviewLoans} onVerify={handleFinanceVerify} onReject={handleFinanceReject} />
          <LoanPipelinePanel
            title="Final approval (Federal step)"
            blurb="Finance-verified loans awaiting final sign-off before disbursement."
            loans={awaitingApprovalLoans}
            primaryLabel="Approve"
            onPrimary={handleApproveLoan}
            onReject={handleFinanceReject}
          />
          <BoostDepositReviewPanel deposits={pendingDeposits} onVerify={handleVerifyBoostDeposit} />
          <LoanDisbursementPanel loans={loans} onDisburse={handleDisburse} />
          <RepaymentReconciliationPanel repayments={repayments} onVerify={handleVerifyRepayment} />
        </>
      )}

      {tab === "settlements" && (
        <>
          {settlementError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{settlementError}</p>
            </div>
          )}
          <SettlementPanel payments={settlements} onPay={handlePaySettlement} />
        </>
      )}

      {tab === "prices" && (
        <>
          {priceError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{priceError}</p>
            </div>
          )}
          <PriceEditorPanel prices={prices} onSave={handleSavePrice} />
        </>
      )}

      {tab === "investments" && (
        <>
          {investmentError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{investmentError}</p>
            </div>
          )}
          <ApplicationReviewPanel
            applications={applications}
            onDecide={handleApplicationDecision}
            onDownloadAgreement={handleDownloadAgreement}
          />
          <PartnerStatusPanel reviews={partnerReviews} onApprove={handlePartnerApprove} />
          <ROIPayoutPanel payouts={roiPayouts} onApprove={handleRoiApprove} />
          <div className="card">
            <p className="text-sm text-ink-600">Payment due-date reminders</p>
            <p className="mt-1 text-xs text-ink-600">
              Runs automatically every day at 8am, emailing any investor whose next payment is due tomorrow.
              Trigger it manually here if you need to check right now.
            </p>
            <button type="button" className="btn-outline mt-3 text-xs" disabled={reminderRunning} onClick={handleRunReminderCheck}>
              {reminderRunning ? "Checking…" : "Run reminder check now"}
            </button>
            {reminderResult && (
              <p className="mt-2 text-xs text-canopy-800">
                Checked {reminderResult.checked} due payment{reminderResult.checked === 1 ? "" : "s"}, sent {reminderResult.sent} reminder{reminderResult.sent === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </>
      )}

      {tab === "savings" && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm text-ink-600">Farmer savings balances</p>
            {savingsError && <p className="mt-2 text-sm text-red-700">{savingsError}</p>}
            {savingsFarmers.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing to show yet.</p>}
            <div className="mt-3 space-y-2">
              {savingsFarmers.map((f) => (
                <div key={f.userId} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{f.farmerName}</p>
                      <p className="text-xs text-ink-600">
                        Main: ₦{f.mainTotal.toLocaleString()} · Insurance: ₦{f.insuranceTotal.toLocaleString()}
                      </p>
                    </div>
                    <InsuranceApplyControl farmer={f} onApply={handleApplyInsurance} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Withdrawal requests</p>
            {savingsWithdrawals.filter((w) => w.status === "requested").length === 0 && (
              <p className="mt-2 text-sm text-ink-600">No pending requests.</p>
            )}
            <div className="mt-3 space-y-2">
              {savingsWithdrawals
                .filter((w) => w.status === "requested")
                .map((w) => (
                  <div key={w.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
                    <div>
                      <p className="text-sm text-ink-900">{w.farmerName}</p>
                      <p className="text-xs text-ink-600">
                        {w.accountType} · ₦{w.amount.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-outline" type="button" onClick={() => handleWithdrawalDecision(w.id, "declined")}>
                        Decline
                      </button>
                      <button className="btn-primary" type="button" onClick={() => handleWithdrawalDecision(w.id, "paid")}>
                        Mark paid
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminDashboardShell>
  );
}
