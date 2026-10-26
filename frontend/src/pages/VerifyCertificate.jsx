import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "../api/client.js";

const longDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

// Public page — no sign-in. Shows ONLY the holder's name, batch and issue
// date for a genuine, released certificate.
export default function VerifyCertificate() {
  const { code: urlCode } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(urlCode || "");
  const [state, setState] = useState({ status: urlCode ? "loading" : "idle" });

  async function check(code) {
    const clean = String(code || "").trim();
    if (!clean) return;
    setState({ status: "loading" });
    try {
      const d = await apiFetch(`/certificates/verify/${encodeURIComponent(clean)}`, { auth: false });
      setState({ status: "valid", data: d });
    } catch (err) {
      setState({ status: err.valid === false && !/many/i.test(err.message) ? "invalid" : "error", message: err.message });
    }
  }

  useEffect(() => {
    if (urlCode) {
      setInput(urlCode);
      check(urlCode);
    }
  }, [urlCode]);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Verify a certificate</h1>
      <p className="mt-2 text-sm text-ink-800">Scan the QR code on an EPHAAG Farms certificate, or type the verification code printed on it.</p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = input.replace(/[^A-Za-z0-9]/g, "");
          if (clean) navigate(`/verify-certificate/${clean}`);
        }}
      >
        <input aria-label="Verification code" value={input} onChange={(e) => setInput(e.target.value)} placeholder="ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2"
          className="h-11 flex-1 rounded-card border border-soil-200 px-3 font-mono text-sm" />
        <button type="submit" className="h-11 rounded-card bg-[#2c6b2f] px-6 text-sm font-semibold text-white">Verify</button>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.status === "loading" && <p className="text-sm text-ink-600">Checking…</p>}
        {state.status === "valid" && (
          <section className="rounded-card border border-[#2c6b2f] bg-[#e9f1e6] p-5" data-testid="verify-valid">
            <p className="flex items-center gap-2 font-semibold text-[#2c6b2f]"><CheckCircle2 size={20} aria-hidden="true" /> This certificate is genuine</p>
            <dl className="mt-3 space-y-1 text-sm text-ink-900">
              <div><dt className="inline text-ink-600">Name: </dt><dd className="inline font-semibold">{state.data.name}</dd></div>
              <div><dt className="inline text-ink-600">Batch: </dt><dd className="inline font-medium">{state.data.batch}</dd></div>
              <div><dt className="inline text-ink-600">Issue date: </dt><dd className="inline font-medium">{longDate(state.data.issueDate)}</dd></div>
            </dl>
          </section>
        )}
        {state.status === "invalid" && (
          <section className="rounded-card border border-red-200 bg-red-50 p-5" data-testid="verify-invalid">
            <p className="flex items-center gap-2 font-semibold text-red-800"><XCircle size={20} aria-hidden="true" /> No certificate found for this code</p>
            <p className="mt-1 text-sm text-red-800">Check the code and try again. If it is correct, the certificate may not have been released yet.</p>
          </section>
        )}
        {state.status === "error" && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      </div>
    </div>
  );
}
