import { useState } from "react";

export default function ConsultancyManager({ items, onAdd }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    onAdd({ id: `cn${Date.now()}`, title, description });
    setTitle("");
    setDescription("");
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Consultancy</p>
      <div className="mt-3 space-y-2">
        {items.map((c) => (
          <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2">
            <p className="font-medium text-ink-900">{c.title}</p>
            <p className="text-sm text-ink-600">{c.description}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="field mt-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Offering title" />
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <button className="btn-primary" type="submit">Publish offering</button>
      </form>
    </div>
  );
}
