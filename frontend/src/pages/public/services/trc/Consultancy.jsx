import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Consultancy() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="TRC → Consultancy"
        title="Consultancy"
        description="One-on-one guidance for farmers planning a season, facing a problem, or weighing a decision."
        badge="🤝"
      />
      <RoomBackLink to="/services/trc" label="TRC" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What consultancy covers</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Beyond group seminars, farmers can request direct, one-on-one guidance —
            planning a new planting season, troubleshooting a specific problem on their
            farm, or thinking through a bigger decision like taking on a loan or shifting
            crops.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Who it's for</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Available to registered farmers at every stage — from someone planning their
            first season with EPHAAG Farms to an established farmer looking to fine-tune
            their approach.
          </p>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Want to book a consultation?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to reach out through your local Unit Leader.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
