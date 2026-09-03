import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function LoginAdmin() {
  const { login } = useAuth();
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
      if (user.role_type !== "admin") {
        setError("That account isn't an admin account.");
        return;
      }
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-medium text-ink-900">Admin login</h1>
      <p className="mt-1 text-sm text-ink-600">Internal platform staff only.</p>
      <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
        <div>
          <label>Staff email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@ephaagfarms.com"
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
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
      <p className="mt-4 text-xs text-ink-600">
        No admin account yet? <Link to="/register" className="text-canopy-800">Register</Link> with
        the "Admin" account type (you'll need the setup code), or run{" "}
        <code>npm run seed:admin -w backend</code> from the project root.
      </p>
    </div>
  );
}
