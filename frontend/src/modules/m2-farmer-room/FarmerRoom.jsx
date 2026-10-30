import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, User, PackagePlus, Receipt, GraduationCap, Landmark, PiggyBank, MessageSquareWarning, History, Users, Share2, CalendarCheck } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import MyProfilePanel from "./MyProfilePanel.jsx";
import ProfileBanner from "./ProfileBanner.jsx";
import PaymentReturnBanner from "./PaymentReturnBanner.jsx";
import BankAccountCard from "../../components/BankAccountCard.jsx";
import JurisdictionOverview from "./JurisdictionOverview.jsx";
import JurisdictionReport from "./JurisdictionReport.jsx";
import AttendanceMarker from "./AttendanceMarker.jsx";
import RecommendationTool from "./RecommendationTool.jsx";
import ListProductPanel from "./ListProductPanel.jsx";
import DeclareProductPanel from "./DeclareProductPanel.jsx";
import TransactionsPanel from "./TransactionsPanel.jsx";
import CoursesPanel from "./CoursesPanel.jsx";
import AttendanceRoom from "./AttendanceRoom.jsx";
import SavingsPanel from "./SavingsPanel.jsx";
import FarmShareCard from "./FarmShareCard.jsx";
import RankingCard from "./RankingCard.jsx";
import CompanyGrowthChart from "./CompanyGrowthChart.jsx";
import FeedbackPanel from "./FeedbackPanel.jsx";
import ReferralPanel from "./ReferralPanel.jsx";
import CreateUnitPanel from "./CreateUnitPanel.jsx";
import UnitLocationPanel from "./UnitLocationPanel.jsx";
import FarmerProfileReportModal from "./FarmerProfileReportModal.jsx";
import LoanOffice from "../m3-loan-office/LoanOffice.jsx";
import SectionStack from "../../components/SectionStack.jsx";

import useUrlState from "../../hooks/useUrlState.js";
import { TOP_RANK_VALUE, rankLabel } from "../../utils/governance.js";
function honorific(user) {
  if (user.sex === "male") return "Mr";
  if (user.sex === "female") return user.maritalStatus === "married" ? "Mrs" : "Miss";
  return "";
}

const RANKS_ABOVE_MEMBER = ["Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", TOP_RANK_VALUE];

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
  const { session } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const user = session?.user;
  const rank = user?.rank || "Member";
  const isLeader = RANKS_ABOVE_MEMBER.includes(rank);

  const [tab, setTab] = useUrlState("tab", () =>
    new URLSearchParams(window.location.search).has("sharePayment") ? "savings" : "dashboard"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loanStatus, setLoanStatus] = useState({ hasLoan: false, amount: 0, repaidAmount: 0 });
  const [jurisdictionFarmers, setJurisdictionFarmers] = useState([]);
  const [viewingFarmerId, setViewingFarmerId] = useState(null);

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

  if (!user) return null;

  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "profile", label: "Profile", icon: User },
    { key: "list-product", label: "Declare & List", icon: PackagePlus },
    { key: "transactions", label: "Transactions", icon: Receipt },
    { key: "courses", label: "Seminar", icon: GraduationCap },
    { key: "attendance", label: "Attendance", icon: CalendarCheck },
    { key: "loans", label: "Loans", icon: Landmark },
    { key: "savings", label: "Savings", icon: PiggyBank },
    { key: "feedback", label: "Feedback", icon: MessageSquareWarning },
    { key: "history", label: "History", icon: History },
    ...(isLeader ? [{ key: "rank", label: "Rank", icon: Users }] : []),
    { key: "referral", label: "Referral", icon: Share2 },
  ];

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      <PaymentReturnBanner onSettled={() => setRefreshKey((k) => k + 1)} />
      {tab !== "profile" && <ProfileBanner status={user.profileStatus} onOpenProfile={() => setTab("profile")} />}

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
          </div>
          {loading && <p className="text-sm text-canopy-100">Loading…</p>}
          <SectionStack
            label="Dashboard section"
            sections={[
              {
                key: "rank",
                label: "Your rank",
                hidden: loading,
                node: (
                  <div className="card">
                    <p className="text-sm text-ink-600">Your rank</p>
                    <p className="text-lg font-medium text-canopy-800">{rankLabel(rank)}</p>
                  </div>
                ),
              },
              { key: "ranking", label: "Ranking", hidden: loading, node: <RankingCard /> },
              { key: "growth", label: "Company growth", node: <CompanyGrowthChart /> },
            ]}
          />
        </div>
      )}

      {tab === "profile" && (<><MyProfilePanel /><div className="mt-4"><BankAccountCard /></div></>)}

      {tab === "list-product" && (
        <SectionStack
          className="space-y-4"
          label="Go to"
          sections={[
            { key: "declare", label: "Declare produce", node: <DeclareProductPanel /> },
            { key: "list", label: "List a product", node: <ListProductPanel /> },
          ]}
        />
      )}

      {tab === "transactions" && <TransactionsPanel />}

      {tab === "courses" && <CoursesPanel />}

      {tab === "attendance" && <AttendanceRoom />}

      {tab === "loans" && <LoanOffice />}

      {tab === "savings" && (
        <SectionStack
          className="space-y-4"
          label="Go to"
          defaultKey={new URLSearchParams(window.location.search).has("sharePayment") ? "farm-share" : undefined}
          sections={[
            { key: "savings", label: "My savings", node: <SavingsPanel /> },
            { key: "farm-share", label: "Farm shares", node: <FarmShareCard /> },
          ]}
        />
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
        <SectionStack
          label="Go to"
          sections={[
            {
              key: "overview",
              label: "Farmers in my jurisdiction",
              node: (
                <JurisdictionOverview
                  farmers={jurisdictionFarmers}
                  rank={rank}
                  onView={rank === "Unit Leader" ? setViewingFarmerId : undefined}
                />
              ),
            },
            { key: "recommend", label: "Recommend a farmer for a loan", node: <RecommendationTool farmers={jurisdictionFarmers} /> },
            { key: "attendance", label: "Mark attendance", node: <AttendanceMarker farmers={jurisdictionFarmers} onRecorded={loadAll} /> },
            { key: "report", label: "Jurisdiction report", node: <JurisdictionReport /> },
            { key: "unit-location", label: "My unit's location", hidden: rank !== "Unit Leader", node: <UnitLocationPanel /> },
            { key: "create-unit", label: "Create a unit", hidden: rank !== "Unit Leader", node: <CreateUnitPanel /> },
          ]}
        />
      )}

      {tab === "referral" && <ReferralPanel />}

      {viewingFarmerId && (
        <FarmerProfileReportModal farmerId={viewingFarmerId} onClose={() => setViewingFarmerId(null)} />
      )}
    </DashboardShell>
  );
}
