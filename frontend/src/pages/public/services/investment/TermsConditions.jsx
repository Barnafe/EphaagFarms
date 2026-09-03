import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const terms = [
  "Invested capital can't be refunded until your investment tenure expires.",
  "Monthly investment payments can't be stopped before the halfway point of your agreed duration.",
  "Inconsistent monthly payments aren't accepted.",
  "Stopping payment halfway through your term forfeits 5% of your profit; inconsistent payment forfeits 2% of your profit per month of inconsistency.",
  "EPHAAG Farms secures investor capital using a multi-sectoral and multi-commodity risk mitigation strategy.",
  "Partner Investor status requires a minimum of ₦1,000,000 in total investment, or ₦250,000 in investment together with 25 total referrals.",
  "Partner Investors receive an additional 10% compensation for every 10 referrals per annum, and 50% annual compensation after the first 5-year contract.",
  "All investors are entitled to a 0.005% bonus for every referral made.",
  "EPHAAG Farms is not responsible for any payment made into an individual's personal account rather than the company's official account.",
];

export default function TermsConditions() {
  return (
    <div>
      <RoomHero
        theme={themes.investment}
        eyebrow="Investment plans → Terms & conditions"
        title="What every investor agrees to"
        description="The same terms apply whether you choose the monthly or bulk plan."
        badge="§"
      />
      <RoomBackLink to="/services/investment" label="Investment plans" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <ol className="space-y-4">
          {terms.map((term, i) => (
            <li key={term} className="flex gap-4 rounded-card border border-soil-200 bg-white p-5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-canopy-900 font-display text-sm font-semibold text-harvest-400">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-ink-800">{term}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Have questions before you commit?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">
            Reach out and we'll walk you through the agreement before you sign.
          </p>
          <Link to="/contact" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
