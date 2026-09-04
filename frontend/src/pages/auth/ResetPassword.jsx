import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import PasswordInput from "../../components/PasswordInput.jsx";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!uid || !token) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16 text-center">
        <p className="text-sm text-ink-600">
          This reset link looks invalid. Please{" "}
          <Link to="/forgot-password" className="text-canopy-800">
            request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(uid, token, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login/member"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16 text-center">
        <p className="text-sm text-canopy-800">Password updated — taking you to login...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-xl font-medium text-ink-900">Set a new password</h1>

      <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
        <div>
          <label>New password</label>
          <PasswordInput
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label>Confirm new password</label>
          <PasswordInput
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
