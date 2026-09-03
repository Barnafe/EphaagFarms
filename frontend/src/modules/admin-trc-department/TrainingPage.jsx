import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import { SeminarManager, CourseManager } from "./TrainingManagers.jsx";

export default function TrainingPage() {
  const [seminars, setSeminars] = useState([]);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ seminars: s }, { courses: c }] = await Promise.all([
        apiFetch("/rtc/admin/seminars"),
        apiFetch("/rtc/admin/courses"),
      ]);
      setSeminars(s);
      setCourses(c);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddSeminar({ title, date, location }) {
    try {
      await apiFetch("/rtc/admin/seminars", {
        method: "POST",
        body: { title, eventDate: date, location },
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddCourse({ title, description }) {
    try {
      await apiFetch("/rtc/admin/courses", { method: "POST", body: { title, description } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/admin/trc" className="text-xs text-canopy-300 hover:underline">
          ← TRC Department
        </Link>
        <h1 className="mt-1 text-xl font-medium text-white">Training</h1>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <SeminarManager items={mapSeminars(seminars)} onAdd={handleAddSeminar} />
      <CourseManager items={courses} onAdd={handleAddCourse} />
    </div>
    </AdminDashboardShell>
  );
}

function mapSeminars(rows) {
  return rows.map((s) => ({ id: s.id, title: s.title, date: s.event_date, location: s.location }));
}
