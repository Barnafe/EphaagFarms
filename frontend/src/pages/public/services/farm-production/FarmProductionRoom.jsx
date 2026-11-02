import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import ServiceCardGrid from "../../../../components/public-services/ServiceCardGrid.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const cards = [
  {
    to: "/services/farm-production/livestock",
    title: "Livestock farming",
    description: "Poultry, fish and aquaculture, cattle, and goat & sheep raised on company-owned farms.",
    badge: "🐄",
  },
  {
    to: "/services/farm-production/crops",
    title: "Crop production",
    description: "Grains, tubers, vegetables and cash crops grown at scale to feed the same supply we sell.",
    badge: "🌾",
  },
];

export default function FarmProductionRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Farm production"
        title="We don't just source, we grow"
        description="Company-owned farms add to the supply we sell from."
        badge="🌾"
      />
      <RoomBackLink to="/" label="Back to home" />
      <ServiceCardGrid items={cards} theme={themes.farmProduction} />
    </div>
  );
}
