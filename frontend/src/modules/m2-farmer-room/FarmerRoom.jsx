import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, User, PackagePlus, Receipt, GraduationCap, Landmark, PiggyBank, MessageSquareWarning, History, Users } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import FarmerProfileCard from "./FarmerProfileCard.jsx";
import JurisdictionOverview from "./JurisdictionOverview.jsx";
import JurisdictionReport from "./JurisdictionReport.jsx";
import AttendanceMarker from "./AttendanceMarker.jsx";
import ListProductPanel from "./ListProductPanel.jsx";
import DeclareProductPanel from "./DeclareProductPanel.jsx";
import TransactionsPanel from "./TransactionsPanel.jsx";
import CoursesPanel from "./CoursesPanel.jsx";
import SavingsPanel from "./SavingsPanel.jsx";
import FarmShareCard from "./FarmShareCard.jsx";
import RankingCard from "./RankingCard.jsx";
import CompanyGrowthChart from "./CompanyGrowthChart.jsx";
import FeedbackPanel from "./FeedbackPanel.jsx";
import LoanOffice from "../m3-loan-office/LoanOffice.jsx";

function honorific(user) {
  if (user.sex === "male") return "Mr";
  if (user.sex === "female") return user.maritalStatus === "married" ? "Mrs" : "Miss";
  return "";
}

const RANKS_ABOVE_MEMBER = ["Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"];

function mapLoanStatus(loans) {
  const active = loans.find((l) => l.status === "disbursed");
  if (!active) return { hasLoan: false, amount: 0, repaidAmount: 0 };
  return { hasLoan: true, amount: Number(active.amount), _loanId: active.id };
}

function mapJurisdictionFarmer(f) {
  return {
    id: f.id,
    name: f.name,
    unit: f.unit,
    attendancePct: f.attendance_pct != null ? Number(f.attendance_pct) : 0,
  };
}

export default function FarmerRoom() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;
  const rank = user?.rank || "Member";
  const isLeader = RANKS_ABOVE_MEMBER.includes(rank);

  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loanStatus, setLoanStatus] = useState({ hasLoan: false, amount: 0, repaidAmount: 0 });
  const [jurisdictionFarmers, setJurisdictionFarmers] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { loans } = await apiFetch("/loans/me");
      const status = mapLoanStatus(loans);
      if (status.hasLoan) {
        const { repayments } = await apiFetch(`/loans/${status._loanId}/repayments`);
        status.repaidAmount = repayments
          .filter((r) => r.verified)
          .reduce((sum, r) => sum + Number(r.amount), 0);
      }
      setLoanStatus(status);

      if (isLeader) {
        const { farmers } = await apiFetch("/farmers/jurisdiction");
        setJurisdictionFarmers(farmers.map(mapJurisdictionFarmer));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isLeader]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleProfileSave({ crops, state, lga, ward, unit }) {
    try {
      await apiFetch("/farmers/me", { method: "PUT", body: { crops, state, lga, ward, unit } });
      await refreshSession();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  const profile = {
    crops: user.crops || [],
    state: user.state,
    lga: user.lga,
    ward: user.ward,
    unit: user.unit,
  };

  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "profile", label: "Profile", icon: User },
    { key: "list-product", label: "Declare & List", icon: PackagePlus },
    { key: "transactions", label: "Transactions", icon: Receipt },
    { key: "courses", label: "RTC", icon: GraduationCap },
    { key: "loans", label: "Loans", icon: Landmark },
    { key: "savings", label: "Savings", icon: PiggyBank },
    { key: "feedback", label: "Feedback", icon: MessageSquareWarning },
    { key: "history", label: "History", icon: History },
    ...(isLeader ? [{ key: "rank", label: "Rank", icon: Users }] : []),
  ];

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-medium text-white">
              Welcome back {honorific(user)} {user.name}
            </h1>
            <p className="mt-1 text-sm text-canopy-100">
              EPHAAG Farms connects farmers, buyers, processors, and investors across the country —
              sourcing produce at fair, standardized prices and getting it where it's needed, feeding
              humanity with safe food.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-canopy-100">Loading…</p>
          ) : (
            <>
              <div className="card">
                <p className="text-sm text-ink-600">Your rank</p>
                <p className="text-lg font-medium text-canopy-800">{rank}</p>
              </div>
              <RankingCard />
            </>
          )}
          <CompanyGrowthChart />
        </div>
      )}

      {tab === "profile" && <FarmerProfileCard profile={profile} onSave={handleProfileSave} />}

      {tab === "list-product" && (
        <div className="space-y-4">
          <DeclareProductPanel />
          <ListProductPanel />
        </div>
      )}

      {tab === "transactions" && <TransactionsPanel />}

      {tab === "courses" && <CoursesPanel />}

      {tab === "loans" && <LoanOffice />}

      {tab === "savings" && (
        <div className="space-y-4">
          <SavingsPanel />
          <FarmShareCard />
        </div>
      )}

      {tab === "feedback" && <FeedbackPanel />}

      {tab === "history" && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-white">History</h2>
          <div className="card">
            <p className="text-sm text-ink-600">
              {loanStatus.hasLoan
                ? `Active loan of ₦${loanStatus.amount.toLocaleString()}, ₦${loanStatus.repaidAmount.toLocaleString()} repaid so far.`
                : "No loan history yet."}
            </p>
          </div>
        </div>
      )}

      {tab === "rank" && isLeader && (
        <div className="space-y-6">
          <AttendanceMarker farmers={jurisdictionFarmers} onRecorded={loadAll} />
          <JurisdictionOverview farmers={jurisdictionFarmers} rank={rank} />
          <JurisdictionReport />
        </div>
      )}
    </DashboardShell>
  );
}
