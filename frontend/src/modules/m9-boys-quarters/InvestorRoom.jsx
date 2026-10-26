import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, User } from "lucide-react";
import { apiFetch, apiUpload } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import TermsSummary from "./TermsSummary.jsx";
import PlanApplicationForm from "./PlanApplicationForm.jsx";
import ApplicationStatusPanel from "./ApplicationStatusPanel.jsx";
import AgreementUpload from "./AgreementUpload.jsx";
import PaymentLog from "./PaymentLog.jsx";
import ROIBreakdown from "./ROIBreakdown.jsx";
import ReferralCard from "./ReferralCard.jsx";

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Profile", icon: User },
];

export default function InvestorRoom() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [application, setApplication] = useState(undefined); // undefined = loading
  const [payments, setPayments] = useState([]);
  const [roiRecords, setRoiRecords] = useState([]);
  const [referral, setReferral] = useState(null);
  const [threshold, setThreshold] = useState({ amount: 1000000, altAmount: 250000, altReferrals: 25 });
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { application: app } = await apiFetch("/investments/me");
      setApplication(app || { status: "none" });

      if (app?.status === "active") {
        const [{ payments: p }, { records }, { referral: r, threshold: t }] = await Promise.all([
          apiFetch("/investments/me/payments"),
          apiFetch("/investments/me/roi"),
          apiFetch("/investments/me/referral"),
        ]);
        setPayments(p);
        setRoiRecords(records);
        setReferral(r);
        setThreshold(t);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApply(planDetails) {
    try {
      await apiFetch("/investments/apply", { method: "POST", body: planDetails });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogPayment(payment) {
    try {
      await apiFetch("/investments/me/payments", { method: "POST", body: { amount: payment.amount } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUploadAgreement(file) {
    const formData = new FormData();
    formData.append("file", file);
    await apiUpload(`/investments/applications/${application.id}/agreement`, formData);
    await load();
  }

  if (!user || application === undefined) {
    return (
      <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
        <p className="text-sm text-canopy-100">Loading…</p>
      </DashboardShell>
    );
  }

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
            <h1 className="text-xl font-medium text-white">Welcome, {user.name}</h1>
          </div>

          {application.status === "none" ? (
            <>
              <TermsSummary />
              <PlanApplicationForm onSubmit={handleApply} />
            </>
          ) : (
            <>
              <ApplicationStatusPanel application={application} />

              {application.status === "agreement_pending" && (
                <AgreementUpload onUpload={handleUploadAgreement} />
              )}

              {application.status === "active" && (
                <>
                  <PaymentLog application={application} payments={payments} onLogPayment={handleLogPayment} />
                  <ROIBreakdown records={roiRecords} />
                  {referral && <ReferralCard referral={referral} threshold={threshold} />}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "profile" && (
        <AccountProfileCard user={user} extraFields={[{ label: "Occupation", value: user.occupation }]} />
      )}
    </DashboardShell>
  );
}
