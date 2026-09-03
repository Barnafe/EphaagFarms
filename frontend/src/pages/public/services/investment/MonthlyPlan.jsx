import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import ROITable from "../../../../components/public-services/ROITable.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const rows = [
  { year: "Year 1", roi: "10%" },
  { year: "Year 2", roi: "20%" },
  { year: "Year 3", roi: "30%" },
  { year: "Year 4", roi: "40%" },
  { year: "Year 5", roi: "50%" },
];

export default function MonthlyPlan() {
  return (
    <div>
      <RoomHero
        theme={themes.investment}
        eyebrow="Investment plans → Monthly"
        title="Monthly investment"
        description="₦5,000 and above, paid consistently every month for your agreed term."
        badge="₦"
      />
      <RoomBackLink to="/services/investment" label="Investment plans" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">How it works</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            You choose a monthly amount of ₦5,000 or above — whatever fits your financial
            capacity — and pay it consistently for your agreed term. Your return is calculated
            on the total amount you've invested that year, at the rate below.
          </p>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold text-ink-900">Return schedule</h2>
          <p className="mt-2 text-sm text-ink-600">
            ROI is calculated on your total annual contribution, rising each year you stay in.
          </p>
          <div className="mt-4">
            <ROITable rows={rows} theme={themes.investment} />
          </div>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Good to know</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Your invested capital can't be refunded before your term ends.</li>
            <li>• Monthly payments can't be stopped before the halfway point of your term.</li>
            <li>• Inconsistent payments aren't accepted — see full terms for the penalties.</li>
          </ul>
          <Link to="/services/investment/terms" className="mt-4 inline-block text-sm font-medium text-canopy-800 hover:text-clay-600">
            Read the full terms & conditions →
          </Link>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to start?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as an investor and set up your monthly plan.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
