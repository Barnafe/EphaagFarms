import { useState } from "react";

export function SeminarManager({ items, onAdd }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title || !date || !location) return;
    onAdd({ id: `s${Date.now()}`, title, date, location });
    setTitle("");
    setDate("");
    setLocation("");
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Seminars</p>
      <div className="mt-3 space-y-2">
        {items.map((s) => (
          <div key={s.id} className="rounded-card border border-soil-200 px-3 py-2">
            <p className="font-medium text-ink-900">{s.title}</p>
            <p className="text-xs text-ink-600">{s.date} · {s.location}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="field mt-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Seminar title" />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
        </div>
        <button className="btn-primary" type="submit">Publish seminar</button>
      </form>
    </div>
  );
}

export function CourseManager({ items, onAdd }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    onAdd({ id: `c${Date.now()}`, title, description });
    setTitle("");
    setDescription("");
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Courses</p>
      <p className="mt-1 text-xs text-ink-600">
        Kept simple for now (title + description, completion tracking only) — quizzes and
        certificates can be added later without changing this structure.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((c) => (
          <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2">
            <p className="font-medium text-ink-900">{c.title}</p>
            <p className="text-sm text-ink-600">{c.description}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="field mt-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <button className="btn-primary" type="submit">Publish course</button>
      </form>
    </div>
  );
}
