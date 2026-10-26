import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";
import {
  AIDED_LEVELS, BOOST_TIERS, BOOST_MONTHS, FAST_CASH_TIERS, FAST_CASH_MONTHS,
  SHARE_PRICE, SHARE_LOCK_YEARS, SHARE_YEAR_RATES, SHARE_TABLE_ROWS, shareRow, naira,
} from "../../../../data/financingBanner.js";

export default function FarmerFinancingRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.farmerFinancing}
        eyebrow="Farmer financing"
        title="Funding to grow, reviewed by your own local leaders"
        description="Three loans and a shared-capital plan for registered farmers — every figure below is the official EPHAAG financing schedule, and every loan is reviewed by people in your own farming community, not a faceless office."
        badge="%"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="space-y-5">
          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">LT1 · Progressive Savings Loan</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              0% interest. Save, borrow, repay — and move up a level each time. Loans are 2x your savings in
              Levels 1–3 and 3x in Levels 4–6.
            </p>
            <table className="mt-3 w-full text-left text-sm text-ink-900">
              <thead className="text-xs text-ink-600"><tr><th className="py-1 font-medium">Level</th><th className="font-medium">Savings</th><th className="font-medium">Loan</th><th className="font-medium">Repay in</th></tr></thead>
              <tbody>
                {AIDED_LEVELS.map((l) => (
                  <tr key={l.level} className="border-t border-soil-200"><td className="py-1">{l.level}</td><td>{naira(l.savings)}</td><td>{naira(l.loan)}</td><td>{l.months} months</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">LT2 · Business Boost</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              Boost your business, increase your potential. Pay a 25% deposit (1–90 day maturity period), then repay over {BOOST_MONTHS} months.
            </p>
            <table className="mt-3 w-full text-left text-sm text-ink-900">
              <thead className="text-xs text-ink-600"><tr><th className="py-1 font-medium">Deposit</th><th className="font-medium">Loan</th></tr></thead>
              <tbody>
                {BOOST_TIERS.map((t) => (
                  <tr key={t.loan} className="border-t border-soil-200"><td className="py-1">{naira(t.deposit)}</td><td>{naira(t.loan)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">LT3 · Business Enlargement</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              100% interest (you repay double) over {FAST_CASH_MONTHS} months. Faithful participants only.
            </p>
            <table className="mt-3 w-full text-left text-sm text-ink-900">
              <thead className="text-xs text-ink-600"><tr><th className="py-1 font-medium">Loan</th><th className="font-medium">You repay</th></tr></thead>
              <tbody>
                {FAST_CASH_TIERS.map((t) => (
                  <tr key={t.loan} className="border-t border-soil-200"><td className="py-1">{naira(t.loan)}</td><td>{naira(t.repay)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="font-display text-lg font-semibold text-ink-900">Shared Capital Investment and Rewards</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              One share is {naira(SHARE_PRICE)} over {SHARE_LOCK_YEARS} years. You earn a yearly return on your
              capital — {SHARE_YEAR_RATES.map((p, i) => `${p}% in year ${i + 1}`).join(", ")}. Every share you buy is
              treated separately, with its own interest and withdrawals.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs text-ink-900">
                <thead className="text-ink-600"><tr><th className="py-1 font-medium">Shares</th><th className="font-medium">Capital</th>{SHARE_YEAR_RATES.map((_, i) => <th key={i} className="font-medium">Yr {i + 1}</th>)}<th className="font-medium">Total ROI</th><th className="font-medium">ROI + capital</th></tr></thead>
                <tbody>
                  {SHARE_TABLE_ROWS.map((n) => {
                    const r = shareRow(n);
                    return (
                      <tr key={n} className="border-t border-soil-200"><td className="py-1">{n}</td><td>{naira(r.capital)}</td>{r.years.map((y, i) => <td key={i}>{naira(y)}</td>)}<td>{naira(r.totalRoi)}</td><td className="font-medium">{naira(r.payout)}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
