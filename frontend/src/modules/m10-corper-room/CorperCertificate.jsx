import { useEffect, useState } from "react";
import { Award, Download } from "lucide-react";
import { apiFetch, apiDownload } from "../../api/client.js";
import LockedPanel from "./LockedPanel.jsx";

const longDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

// The member's one general certificate. It stays hidden until the admin
// marks their batch complete; a member who hasn't finished every course just
// sees "not completed" (no certificate, no email).
export default function CorperCertificate({ onGo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch("/corpers/certificate")
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await apiDownload("/corpers/certificate/download", `${data.certificate.number}.pdf`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-ink-600">Loading…</p>;
  const { status, progress, batch } = data;

  if (status === "ready") {
    const c = data.certificate;
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Certificate</h1>
        <section className="rounded-card border border-[#2c6b2f] bg-white p-6">
          <div className="flex items-start gap-4">
            <Award className="shrink-0 text-[#2c6b2f]" size={36} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#2c6b2f]">Your certificate is ready</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink-900" data-testid="cert-holder">{c.holderName}</p>
              <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm text-ink-800 sm:grid-cols-2">
                <div><dt className="inline text-ink-600">Certificate number: </dt><dd className="inline font-medium" data-testid="cert-number">{c.number}</dd></div>
                <div><dt className="inline text-ink-600">Issued: </dt><dd className="inline font-medium">{longDate(c.issueDate)}</dd></div>
                <div><dt className="inline text-ink-600">State code: </dt><dd className="inline font-medium">{c.stateCode || "—"}</dd></div>
                <div><dt className="inline text-ink-600">Batch: </dt><dd className="inline font-medium">{c.serviceYear} Batch {c.batch}</dd></div>
              </dl>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={download} disabled={busy}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white disabled:opacity-60">
            <Download size={16} aria-hidden="true" /> {busy ? "Preparing PDF…" : "Download PDF"}
          </button>
          <p className="mt-4 text-xs text-ink-600">
            Anyone can confirm it is genuine by scanning the QR code on it, or at <span className="font-medium">/verify-certificate</span> with this code: <span className="font-mono">{c.verificationCode.match(/.{1,4}/g).join("-")}</span>
          </p>
        </section>
      </div>
    );
  }

  if (status === "awaiting_batch") {
    return (
      <LockedPanel
        title="Training complete — certificate on its way"
        body={`You have finished every course. Your certificate is released when your batch is marked complete${batch?.dueDate ? ` (due ${longDate(batch.dueDate)})` : ""}. You will be emailed as soon as it is ready.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <LockedPanel
        title="Not completed yet"
        body={
          progress.total > 0
            ? `You have completed ${progress.done} of ${progress.total} course${progress.total === 1 ? "" : "s"}. Your certificate is issued after you finish every course.`
            : "Your certificate is issued after you finish every course. Courses appear in My Training once they are published."
        }
      />
      <div className="text-center">
        <button type="button" onClick={() => onGo("training")} className="h-11 rounded-card bg-[#2c6b2f] px-6 text-sm font-semibold text-white">Go to My Training</button>
      </div>
    </div>
  );
}
