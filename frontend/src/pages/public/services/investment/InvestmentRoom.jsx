import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import ServiceCardGrid from "../../../../components/public-services/ServiceCardGrid.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const cards = [
  {
    to: "/services/investment/monthly",
    title: "Monthly investment",
    description: "Start from ₦5,000 a month, at whatever amount fits your budget.",
    badge: "₦",
  },
  {
    to: "/services/investment/bulk",
    title: "Bulk investment",
    description: "A single payment of ₦100,000 or more, for higher year-one returns.",
    badge: "≈",
  },
  {
    to: "/services/investment/terms",
    title: "Terms & conditions",
    description: "What every investor agrees to before signing on.",
    badge: "§",
  },
];

export default function InvestmentRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.investment}
        eyebrow="Investment plans"
        title="Grow your money alongside a working farm operation"
        description="Two ways to invest with EPHAAG Farms — a steady monthly contribution or a single bulk payment — both with a transparent, published return for every year of the term."
        badge="≈"
      />
      <RoomBackLink to="/" label="Back to home" />
      <ServiceCardGrid items={cards} theme={themes.investment} />
    </div>
  );
}
