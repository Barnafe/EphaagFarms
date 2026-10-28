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
import PayPanel from "./PayPanel.jsx";
import ROIBreakdown from "./ROIBreakdown.jsx";
import ReferralCard from "./ReferralCard.jsx";
import SectionStack from "../../components/SectionStack.jsx";

import useUrlState from "../../hooks/useUrlState.js";
import { useSearchParams } from "react-router-dom";
const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Profile", icon: User },
];

export default function InvestorRoom() {
  const [, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useUrlState("tab", "dashboard");
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

  // Coming back from Paystack: ask what happened to this payment, then reload.
  const [returned, setReturned] = useState(null);
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("investmentPayment");
    if (!ref) { load(); return; }
    let tries = 0, stop = false;
    (async function check() {
      try {
        const st = await apiFetch(`/payments/status/${encodeURIComponent(ref)}`);
        if (stop) return;
        setReturned(st);
        if (st.outcome === "pending" && tries++ < 8) { setTimeout(check, 2500); return; }
      } catch (err) { if (!stop) setError(err.message); }
      // Drop only the payment reference (keep ?tab=…) through the router, so its idea of the
      // URL stays in sync and Back never replays the payment check.
      const rest = new URLSearchParams(window.location.search);
      rest.delete("investmentPayment");
      setSearchParams(rest, { replace: true });
      load();
    })();
    return () => { stop = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply(planDetails) {
    try {
      await apiFetch("/investments/apply", { method: "POST", body: planDetails });
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

      {returned && (
        <div className={`card mb-6 ${returned.outcome === "success" ? "border-canopy-200 bg-canopy-50" : returned.outcome === "pending" ? "border-harvest-200 bg-harvest-50" : "border-red-200 bg-red-50"}`} role="status">
          <p className="text-sm text-ink-900">
            {returned.outcome === "success" && "Payment received. Thank you. A receipt has been sent to you."}
            {returned.outcome === "pending" && "We are still waiting for Paystack to confirm your payment. This page updates by itself; you will also get a message."}
            {returned.outcome === "failed" && "The payment did not go through. Nothing was taken, so you can try again."}
            {returned.outcome === "refused" && `Your payment arrived but could not be used because ${returned.refusalText || "it could not be applied"}. Our administrators have been told and will return the money to you.`}
            {returned.outcome === "expired" && "That payment page has expired. Please start again."}
          </p>
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

              {application.status === "awaiting_payment" && <PayPanel application={application} onError={setError} />}

              {application.status === "active" && (
                <SectionStack
                  label="Investment section"
                  sections={[
                    {
                      key: "payments",
                      label: "Payments",
                      node: <PaymentLog application={application} payments={payments} onChanged={load} onError={setError} />,
                    },
                    { key: "roi", label: "ROI breakdown", node: <ROIBreakdown records={roiRecords} /> },
                    {
                      key: "referral",
                      label: "Referral",
                      hidden: !referral,
                      node: <ReferralCard referral={referral} threshold={threshold} />,
                    },
                  ]}
                />
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
