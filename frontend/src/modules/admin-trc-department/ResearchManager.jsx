import { useState } from "react";

export default function ResearchManager({ items, onAdd }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    onAdd({ title, summary });
    setTitle("");
    setSummary("");
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Research</p>
      <div className="mt-3 space-y-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
            <p className="font-medium text-ink-900">{r.title}</p>
            <p className="text-sm text-ink-600">{r.summary}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="field mt-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
        <button className="btn-primary" type="submit">Publish research</button>
      </form>
    </div>
  );
}
