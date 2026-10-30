import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import PasswordInput from "../../components/PasswordInput.jsx";

export default function LoginMember() {
  const { login, logout } = useAuth();
  const [asCorper, setAsCorper] = useState(false);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role_type === "admin") {
        setError("This is an admin account — use Login (admin) instead.");
        return;
      }
      if (asCorper && user.role_type !== "corper") {
        logout();
        setError("This is not an NYSC AGROALLIED SAED member account. Switch to Member to log in.");
        return;
      }
      navigate(`/dashboard/${user.role_type}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-medium text-ink-900">Member login</h1>
      <p className="mt-1 text-sm text-ink-600">
        Farmers, buyers/processors, transporters, distributors, investors, and NYSC AGROALLIED SAED members.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm" role="group" aria-label="Account type">
        <button type="button" onClick={() => setAsCorper(false)} aria-pressed={!asCorper}
          className={`rounded-card border px-3 py-2 ${!asCorper ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-800"}`}>Member</button>
        <button type="button" onClick={() => setAsCorper(true)} aria-pressed={asCorper}
          className={`rounded-card border px-3 py-2 ${asCorper ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-800"}`}>NYSC AGROALLIED SAED</button>
      </div>
      <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
        <div>
          <label>Email or phone number</label>
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com or 080..."
          />
        </div>
        <div>
          <label>Password</label>
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-600">
        No account yet? <Link to="/register" className="text-canopy-800">Register</Link>
      </p>
      <p className="mt-2 text-sm text-ink-600">
        <Link to="/forgot-password" className="text-canopy-800">Forgot your password?</Link>
      </p>
    </div>
  );
}
