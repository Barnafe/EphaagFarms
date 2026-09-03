import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Training() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="TRC → Training"
        title="Training"
        description="Seminars and short courses run regularly across every region, free for members."
        badge="🎓"
      />
      <RoomBackLink to="/services/trc" label="TRC" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What's covered</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            In-person seminars are held at unit and ward halls on practical topics —
            spacing techniques, post-harvest storage, fertilizer timing, irrigation on a
            budget — plus short online courses on things like soil testing and
            record-keeping. New sessions are announced through your local Unit Leader.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Why it matters for members</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Seminar attendance is tracked and shown on your farmer dashboard.</li>
            <li>• Course completion is tracked the same way.</li>
            <li>• Both factor into loan application review — consistent attendance and progress support your case.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to start learning?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to see upcoming seminars and courses.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
