import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import ConsultancyCard from "../../../../components/public-services/ConsultancyCard.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Trc() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="TRC"
        title="Training, Research & Consultancy"
        description="One of EPHAAG Farms' core offerings, free training for members, our own research, and one-on-one consultancy open to everyone."
        badge="🎓"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14 space-y-8">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">Training</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Short practical courses on spacing, storage, fertilizer timing, irrigation, soil testing and record keeping.</p>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">Research</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Internal research that shapes our training, pricing and advice.</p>
        </div>

        <ConsultancyCard heading="Consultancy" headingClass="font-display text-xl font-semibold text-ink-900" />

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to get involved?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to see the latest courses and join our training.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
