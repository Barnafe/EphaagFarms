import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-medium text-ink-900">Forgot your password?</h1>
      <p className="mt-1 text-sm text-ink-600">
        Enter your account email and we'll send you a link to set a new password.
      </p>

      <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
        <div>
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-canopy-800">{message}</p>}
        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-600">
        <Link to="/login/member" className="text-canopy-800">
          ← Back to login
        </Link>
      </p>
    </div>
  );
}
