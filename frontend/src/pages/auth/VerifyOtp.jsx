import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function VerifyOtp() {
  const { verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, email } = location.state || {};

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  if (!userId) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16 text-center">
        <p className="text-sm text-ink-600">
          We couldn't find a pending verification. Please{" "}
          <Link to="/register" className="text-canopy-800">
            start registration again
          </Link>
          .
        </p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await verifyOtp(userId, code);
      navigate(`/dashboard/${user.role_type}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setInfo("");
    setResending(true);
    try {
      const result = await resendOtp(userId);
      setInfo(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-medium text-ink-900">Enter your code</h1>
      <p className="mt-1 text-sm text-ink-600">
        We sent a 6-digit code to <span className="font-medium">{email}</span>.
      </p>

      <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
        <div>
          <label>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-canopy-800">{info}</p>}
        <button className="btn-primary w-full" type="submit" disabled={submitting || code.length !== 6}>
          {submitting ? "Verifying..." : "Verify and continue"}
        </button>
      </form>

      <button
        onClick={handleResend}
        disabled={resending}
        className="mt-4 text-sm text-canopy-800 disabled:opacity-60"
      >
        {resending ? "Sending..." : "Didn't get a code? Resend"}
      </button>
    </div>
  );
}
