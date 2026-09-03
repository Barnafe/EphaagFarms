import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import LoanEligibility from "./LoanEligibility.jsx";
import LoanApplicationForm from "./LoanApplicationForm.jsx";
import BoostDepositPanel from "./BoostDepositPanel.jsx";
import LoanStatusPanel from "./LoanStatusPanel.jsx";
import RepaymentTracker from "./RepaymentTracker.jsx";
import UnitLeaderReview from "./UnitLeaderReview.jsx";
import FederalApproval from "./FederalApproval.jsx";

// --- Backend → frontend shape mapping ------------------------------------

function mapMyLoan(l) {
  if (!l) return { status: "none", repayments: [] };
  return {
    id: l.id,
    reference: l.reference,
    // Sub-components use "active" for a live, disbursed loan.
    status: l.status === "disbursed" ? "active" : l.status,
    loanType: l.loan_type,
    interestRate: l.interest_rate ? Number(l.interest_rate) : null,
    amount: Number(l.amount),
    repaymentMonths: l.repayment_months,
    rejectionReason: l.rejection_reason,
    reapplyAfter: l.reapply_after,
    repayments: [],
  };
}

function mapRepayment(r) {
  return {
    id: r.id,
    date: r.paid_at?.slice(0, 10),
    amount: Number(r.amount),
    method: r.method,
  };
}

function mapDeposit(d) {
  return {
    id: d.id,
    intendedLoanAmount: d.intendedLoanAmount,
    depositAmount: d.depositAmount,
    verifiedAt: d.verifiedAt,
    usedForLoanId: d.usedForLoanId,
    isEligible: d.isEligible,
    eligibleFrom: d.eligibleFrom,
  };
}

function mapPendingApp(l) {
  return {
    id: l.id,
    farmerName: l.farmer_name,
    loanType: l.loan_type,
    amount: Number(l.amount),
    attendancePct: l.attendance_pct != null ? Number(l.attendance_pct) : 0,
    coursePct: l.course_pct != null ? Number(l.course_pct) : 0,
  };
}

function mapRecommendedApp(l) {
  return {
    id: l.id,
    farmerName: l.farmer_name,
    loanType: l.loan_type,
    amount: Number(l.amount),
    recommendedBy: l.recommended_by_name || "Unit Leader",
  };
}

export default function LoanOffice() {
  const { session } = useAuth();
  const rank = session?.user?.rank || "Member";
  const isUnitLeader = rank === "Unit Leader";
  const isFederal = rank === "Federal";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loan, setLoan] = useState({ status: "none", repayments: [] });
  const [pending, setPending] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityHistory, setEligibilityHistory] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [mainSavingsBalance, setMainSavingsBalance] = useState(0);
  const [aidedTerms, setAidedTerms] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { loans } = await apiFetch("/loans/me");
      const latest = loans[0] || null;
      const mapped = mapMyLoan(latest);

      if (latest && latest.status === "disbursed") {
        const { repayments } = await apiFetch(`/loans/${latest.id}/repayments`);
        mapped.repayments = repayments.map(mapRepayment);
      }
      setLoan(mapped);

      const indices = await apiFetch("/loans/me/eligibility");
      setEligibility(indices);

      const { deposits: myDeposits } = await apiFetch("/loans/boost-deposits/me");
      setDeposits(myDeposits.map(mapDeposit));

      const savings = await apiFetch("/farmers/me/savings");
      setMainSavingsBalance(savings.mainBalance || 0);

      const terms = await apiFetch("/loans/me/aided-terms");
      setAidedTerms(terms);

      if (isUnitLeader) {
        const { loans: unitLoans } = await apiFetch("/loans/pending/my-unit");
        setPending(unitLoans.map(mapPendingApp));
      }
      if (isFederal) {
        const { loans: recLoans } = await apiFetch("/loans/recommended");
        setRecommended(recLoans.map(mapRecommendedApp));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isUnitLeader, isFederal]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleLoadEligibilityHistory() {
    try {
      const { history } = await apiFetch("/loans/me/eligibility/history");
      setEligibilityHistory(history);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApply({ loanType, amount, depositId, repaymentMonths, reason }) {    try {
      await apiFetch("/loans", {
        method: "POST",
        body: {
          loan_type: loanType,
          amount,
          depositId,
          repayment_months: repaymentMonths,
          reason,
        },
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeclareDeposit(intendedLoanAmount) {
    try {
      await apiFetch("/loans/boost-deposits", {
        method: "POST",
        body: { intendedLoanAmount },
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogRepayment({ amount, method }) {
    try {
      await apiFetch(`/loans/${loan.id}/repayments`, {
        method: "POST",
        body: { amount, method },
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUnitLeaderDecision(id, decision) {
    try {
      if (decision === "recommended") {
        await apiFetch(`/loans/${id}/recommend`, { method: "POST" });
      } else {
        await apiFetch(`/loans/${id}/reject`, { method: "POST" });
      }
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFederalDecision(id, decision) {
    try {
      if (decision === "active") {
        await apiFetch(`/loans/${id}/approve`, { method: "POST" });
      } else {
        await apiFetch(`/loans/${id}/reject`, { method: "POST" });
      }
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const eligibleDeposits = deposits.filter((d) => d.isEligible);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-600">Module 3</p>
        <h1 className="text-xl font-medium text-ink-900">Loan Office</h1>
        <p className="mt-1 text-sm text-ink-600">Signed in as {rank}.</p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && <p className="text-sm text-ink-600">Loading…</p>}

      {!loading && (
        <>
          <LoanEligibility indices={eligibility} history={eligibilityHistory} onLoadHistory={handleLoadEligibilityHistory} />

          {loan.status === "none" && (
            <>
              <LoanApplicationForm
                onSubmit={handleApply}
                eligibleDeposits={eligibleDeposits}
                mainSavingsBalance={mainSavingsBalance}
                aidedTerms={aidedTerms}
              />
              <BoostDepositPanel deposits={deposits} onDeclare={handleDeclareDeposit} />
            </>
          )}

          {loan.status !== "none" && <LoanStatusPanel loan={loan} />}

          {loan.status === "active" && (
            <RepaymentTracker loan={loan} onLogRepayment={handleLogRepayment} />
          )}

          {isUnitLeader && (
            <UnitLeaderReview applications={pending} onRecommend={handleUnitLeaderDecision} />
          )}

          {isFederal && (
            <FederalApproval applications={recommended} onDecide={handleFederalDecision} />
          )}
        </>
      )}
    </div>
  );
}
