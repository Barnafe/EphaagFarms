import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

export default function AdminContactMessagesPage() {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { messages: m } = await apiFetch("/contact/admin");
      setMessages(m);
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

  async function handleReview(id) {
    try {
      await apiFetch(`/contact/admin/${id}/review`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Contact messages</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Messages submitted through the public website's Contact page.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="card">
          {loading ? (
            <p className="text-sm text-ink-600">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-ink-600">Nothing submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-canopy-800">
                      {m.name}
                      {m.email ? ` — ${m.email}` : ""}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        m.status === "reviewed" ? "bg-canopy-50 text-canopy-800" : "bg-harvest-50 text-harvest-600"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-900">{m.message}</p>
                  {m.status !== "reviewed" && (
                    <button className="btn-outline mt-2" type="button" onClick={() => handleReview(m.id)}>
                      Mark reviewed
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
