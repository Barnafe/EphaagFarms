import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Users, Landmark, FolderPlus, Flag } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import RecommendationTool from "../m2-farmer-room/RecommendationTool.jsx";
import AttendanceMarker from "../m2-farmer-room/AttendanceMarker.jsx";
import JurisdictionOverview from "../m2-farmer-room/JurisdictionOverview.jsx";
import JurisdictionReport from "../m2-farmer-room/JurisdictionReport.jsx";
import CreateUnitPanel from "../m2-farmer-room/CreateUnitPanel.jsx";
import FarmerProfileReportModal from "../m2-farmer-room/FarmerProfileReportModal.jsx";
import UnitLeaderReview from "../m3-loan-office/UnitLeaderReview.jsx";

function mapJurisdictionFarmer(f) {
  return {
    id: f.id,
    name: f.name,
    unit: f.unit,
    attendancePct: f.attendance_pct != null ? Number(f.attendance_pct) : 0,
  };
}

function mapLoan(l) {
  return {
    id: l.id,
    farmerName: l.farmer_name,
    loanType: l.loan_type,
    amount: Number(l.amount),
    attendancePct: l.attendance_pct != null ? Number(l.attendance_pct) : 0,
    coursePct: l.course_pct != null ? Number(l.course_pct) : 0,
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "jurisdiction", label: "Jurisdiction", icon: Users },
  { key: "loans", label: "Loan review", icon: Landmark },
  { key: "createUnit", label: "Create unit", icon: FolderPlus },
];

// Everything a real Unit Leader can do, reached via "Login As" instead of
// their own account — same components, same endpoints. Every one of these
// endpoints is already gated by requireFarmerRankOrAdmin("Unit Leader"),
// which treats role_type='admin' as a company-wide bypass (see
// farmerRank.js), so there's no separate admin-only backend path here —
// this page just gives that existing bypass a real screen to sit behind,
// same pattern as every other "Login As" department (2026-09-06 spec).
export default function UnitLeaderDepartment() {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jurisdictionFarmers, setJurisdictionFarmers] = useState([]);
  const [pendingLoans, setPendingLoans] = useState([]);
  const [viewingFarmerId, setViewingFarmerId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ farmers }, { loans }] = await Promise.all([
        apiFetch("/farmers/jurisdiction"),
        apiFetch("/loans/pending/my-unit"),
      ]);
      setJurisdictionFarmers(farmers.map(mapJurisdictionFarmer));
      setPendingLoans(loans.map(mapLoan));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleDecision(id, decision) {
    try {
      await apiFetch(`/loans/${id}/${decision === "recommended" ? "recommend" : "reject"}`, { method: "POST" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab} exitTo="/admin">
      <ActingAsBanner />

      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="space-y-6">
          <h1 className="text-xl font-medium text-white">Unit Leader</h1>
          <p className="text-sm text-canopy-100">
            Acting company-wide here — every unit's farmers and pending applications show up, not just one unit's.
          </p>
          {loading && <p className="text-sm text-canopy-100">Loading…</p>}
        </div>
      )}

      {tab === "jurisdiction" && !loading && (
        <div className="space-y-6">
          <RecommendationTool farmers={jurisdictionFarmers} onIssued={loadAll} />
          <AttendanceMarker farmers={jurisdictionFarmers} onRecorded={loadAll} />
          <JurisdictionOverview farmers={jurisdictionFarmers} rank="Unit Leader" onView={setViewingFarmerId} />
          <JurisdictionReport />
        </div>
      )}

      {tab === "loans" && !loading && (
        <UnitLeaderReview applications={pendingLoans} onRecommend={handleDecision} />
      )}

      {tab === "createUnit" && <CreateUnitPanel />}

      {viewingFarmerId && (
        <FarmerProfileReportModal farmerId={viewingFarmerId} onClose={() => setViewingFarmerId(null)} />
      )}
    </DashboardShell>
  );
}
