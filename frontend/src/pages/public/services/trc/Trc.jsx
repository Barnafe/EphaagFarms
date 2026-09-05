import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Trc() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="TRC"
        title="Training, Research & Consultancy"
        description="One of EPHAAG Farms' core offerings, free to members — practical training courses, published research, and one-on-one consultancy."
        badge="🎓"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14 space-y-8">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">Training</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Short courses on practical topics — spacing techniques, post-harvest storage, fertilizer
            timing, irrigation on a budget, soil testing, and record-keeping. Each course can come with
            downloadable materials and a link to attend the session online. New courses are announced
            through your local Unit Leader, and completion is tracked on your farmer dashboard —
            consistent progress factors into loan application review.
          </p>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">Research</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            EPHAAG publishes short research write-ups on farming practice, market conditions, and
            outcomes drawn from our own farmer network — kept practical and readable, not academic.
          </p>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">Consultancy</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Members can book a one-on-one consultancy session against a published offering — for
            example a farm-planning review or a specific production problem — and track the request
            through to completion.
          </p>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to get involved?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to see the latest courses, research, and consultancy offerings.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
