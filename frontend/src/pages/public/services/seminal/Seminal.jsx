import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Seminal() {
  return (
    <div>
      <RoomHero
        theme={themes.seminal}
        eyebrow="Seminal"
        title="Training courses, hosted online"
        description="EPHAAG Farms uploads and approves training courses for members — materials to read and sessions to attend online, all free."
        badge="🎓"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What's covered</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Short courses on practical topics — spacing techniques, post-harvest storage, fertilizer
            timing, irrigation on a budget, soil testing, and record-keeping. Each course can come with
            downloadable materials and a link to attend the session online. New courses are announced
            through your local Unit Leader.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Why it matters for members</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Course completion is tracked on your farmer dashboard.</li>
            <li>• Consistent progress factors into loan application review.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to start learning?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to see the latest courses.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
