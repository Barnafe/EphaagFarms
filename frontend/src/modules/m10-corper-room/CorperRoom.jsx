import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LayoutDashboard, User, BookOpen, CreditCard, Award, LifeBuoy } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import CorperHome from "./CorperHome.jsx";
import CorperProfile from "./CorperProfile.jsx";
import LockedPanel from "./LockedPanel.jsx";
import CorperPayments from "./CorperPayments.jsx";
import CorperCertificate from "./CorperCertificate.jsx";
import CorperTraining from "./CorperTraining.jsx";

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Profile", icon: User },
  { key: "training", label: "My Training", icon: BookOpen },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "certificate", label: "Certificate", icon: Award },
  { key: "support", label: "Support", icon: LifeBuoy },
];

// Corps member (NYSC) room. Same hamburger shell as every other room; the
// working area is the cream "light portal" look the team picked (option B),
// rendered inside an `on-light` surface so text stays readable within the
// dark .dash-scope frame (see index.css).
export default function CorperRoom() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;
  const [tab, setTab] = useState("dashboard");
  const [bundle, setBundle] = useState(null); // { profile, completion }
  const [error, setError] = useState(null);
  const [courseToOpen, setCourseToOpen] = useState(null); // "Continue learning" deep link
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      setBundle(await apiFetch("/corpers/me"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back from Paystack: /dashboard/corper?corperPayment=REF. Ask the
  // server to verify it (the browser's word is never trusted), then show the
  // Payments tab with the result.
  const returnedRef = searchParams.get("corperPayment");
  useEffect(() => {
    if (!returnedRef) return;
    setTab("payments");
    setVerifying(true);
    apiFetch(`/corpers/payments/${encodeURIComponent(returnedRef)}/verify`, { method: "POST", body: {} })
      .then(() => setNotice(null))
      .catch((err) => setNotice(err.message))
      .finally(() => {
        setVerifying(false);
        setSearchParams({}, { replace: true });
        load();
      });
  }, [returnedRef, load, setSearchParams]);

  if (!user) return null;
  const paid = !!bundle?.access?.paid;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={(k) => { if (k === "training") setCourseToOpen(null); setTab(k); }}>
      <div className="on-light mx-auto max-w-5xl rounded-card bg-soil-50 p-4 text-ink-900 md:p-6">
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
        {!bundle && !error && <p className="text-sm text-ink-600">Loading...</p>}
        {bundle && tab === "dashboard" && <CorperHome user={user} bundle={bundle} onGo={setTab} onOpenCourse={(id) => { setCourseToOpen(id); setTab("training"); }} />}
        {bundle && tab === "profile" && (
          <CorperProfile
            user={user}
            bundle={bundle}
            onSaved={(next) => {
              setBundle(next);
              refreshSession();
            }}
          />
        )}
        {bundle && tab === "training" && <CorperTraining paid={paid} onGoPayments={() => setTab("payments")} initialCourseId={courseToOpen} />}
        {bundle && tab === "payments" && <CorperPayments user={user} verifying={verifying} notice={notice} onChanged={load} />}
        {bundle && tab === "certificate" && <CorperCertificate onGo={setTab} />}
        {bundle && tab === "support" && (
          <div className="rounded-card border border-soil-200 bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-ink-900">Support</h2>
            <p className="mt-2 text-sm text-ink-800">Need help with registration, your profile or payment? Send us a message and we will get back to you.</p>
            <Link to="/contact" className="mt-4 inline-flex h-11 items-center rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white">Contact us</Link>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
