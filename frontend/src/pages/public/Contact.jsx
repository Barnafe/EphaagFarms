import { useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      setError("Please fill in your name and a message.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      await apiFetch("/contact", {
        method: "POST",
        auth: false,
        body: { name: name.trim(), email: email.trim() || undefined, message: message.trim() },
      });
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-medium text-ink-900">Contact</h1>
      <p className="mt-3 text-ink-600">Reach the Ephaag Farms team.</p>

      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2">
        {status === "sent" ? (
          <div className="field">
            <p className="text-sm text-canopy-800">
              Thanks — your message has been sent. We'll get back to you soon.
            </p>
            <button className="btn-outline mt-4" type="button" onClick={() => setStatus("idle")}>
              Send another message
            </button>
          </div>
        ) : (
          <form className="field space-y-4" onSubmit={handleSubmit}>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div>
              <label>Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label>Email (optional)</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label>Message</label>
              <textarea
                rows={4}
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}

        <div className="card">
          <p className="text-sm text-ink-600">Our offices</p>
          <p className="mt-2 text-sm text-ink-900">Yelwa Makaranta, Opp. College of Agric, Bauchi State</p>
          <p className="mt-1 text-sm text-ink-900">No. 05, Old Bridge, Bauchi State</p>

          <p className="mt-4 text-sm text-ink-600">Phone</p>
          <p className="mt-1 text-sm text-ink-900">0912 446 0161</p>
          <p className="text-sm text-ink-900">0901 422 5327</p>

          <p className="mt-4 text-sm text-ink-600">Email</p>
          <p className="mt-1 text-sm text-ink-900">ephaagfarms@gmail.com</p>
        </div>
      </div>
    </div>
  );
}
