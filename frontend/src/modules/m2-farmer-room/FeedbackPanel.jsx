import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const categoryOptions = [
  { value: "challenge", label: "A challenge I'm facing" },
  { value: "maltreatment", label: "Maltreatment from leadership" },
  { value: "suspicious_activity", label: "Suspicious activity" },
  { value: "recommendation", label: "A recommendation" },
  { value: "other", label: "Something else" },
];

export default function FeedbackPanel() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("recommendation");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const { feedback } = await apiFetch("/farmers/me/feedback");
      setItems(feedback);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess("");
    try {
      await apiFetch("/farmers/me/feedback", { method: "POST", body: { category, message } });
      setMessage("");
      setSuccess("Sent — this goes directly to admin.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Feedback</h2>
        <p className="mt-1 text-sm text-canopy-100">
          A direct line to admin — challenges you're facing, concerns about leadership,
          suspicious activity, or anything you'd recommend we do differently.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} className="field space-y-3">
          <div>
            <label>What's this about?</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={4}
              placeholder="Tell us what's going on..."
            />
          </div>
          {success && <p className="text-sm text-canopy-800">{success}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send to admin"}
          </button>
        </form>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">What you've sent before</p>
        {loading ? (
          <p className="mt-2 text-sm text-ink-600">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-600">Nothing sent yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {items.map((f) => (
              <div key={f.id} className="rounded-card border border-soil-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-canopy-800">
                    {categoryOptions.find((c) => c.value === f.category)?.label || f.category}
                  </p>
                  <span className="text-xs text-ink-600">{f.status}</span>
                </div>
                <p className="mt-1 text-sm text-ink-900">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
