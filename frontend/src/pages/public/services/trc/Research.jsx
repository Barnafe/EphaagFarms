import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function Research() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="TRC → Research"
        title="Research"
        description="Field findings from across our farmer network and company-owned farms, published back for anyone to read."
        badge="🔬"
      />
      <RoomBackLink to="/services/trc" label="TRC" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we research</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Findings are drawn from field surveys across our farmer network and our own
            company-owned farms — soil health trends, yield patterns, and what's actually
            working season to season. Research also directly informs the standardized
            pricing set at our annual review meeting with farmers and buyers.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Why it matters</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Research findings feed back into the training curriculum and consultancy
            guidance, so what we learn in the field this season shapes what we teach and
            advise the next.
          </p>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-harvest-600 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Want to read the latest findings?</h3>
          <p className="mt-2 text-sm text-white/85">Register as a farmer to access published research.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-canopy-800">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
