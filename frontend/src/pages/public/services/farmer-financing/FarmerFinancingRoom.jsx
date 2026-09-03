import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

export default function FarmerFinancingRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.farmerFinancing}
        eyebrow="Farmer financing"
        title="Funding to grow, reviewed by your own local leaders"
        description="Two ways to fund your farming season through EPHAAG Farms — an interest-free aid loan or a commercial interest loan — both reviewed by people in your own farming community, not a faceless office."
        badge="%"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">Aid loan</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              No interest charged. Intended to support farmers who need a lighter path back
              to full repayment while they get their season underway.
            </p>
          </div>
          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">Interest loan</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              A commercial loan carrying an agreed interest rate, for farmers looking to
              fund a larger production push and able to repay on commercial terms.
            </p>
          </div>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-xl font-semibold text-ink-900">How the review works</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            An application isn't reviewed by a distant office — it moves up through your own
            farming network. Your Unit Leader reviews it first and either recommends or
            rejects it, and a recommended application then goes to the Federal level for
            final approval before Finance disburses the funds.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            <li>• Attendance at seminars and course completion are both factored into approval.</li>
            <li>• If an application is rejected, you're shown the reason and can reapply after a short cooldown period.</li>
          </ul>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Repayment</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Repayment is manual — by bank transfer or another agreed method — rather than
            deducted automatically from produce sales. While your loan is active, produce
            must be sold through EPHAAG Farms until 70% of the loan has been repaid; once
            you cross that threshold, you're free to sell independently again.
          </p>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-clay-800 to-clay-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to apply?</h3>
          <p className="mt-2 text-sm text-clay-100/90">Register as a farmer to access the Loan Office and apply.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-clay-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
