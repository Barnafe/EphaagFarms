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
        title="We don't just source — we grow"
        description="Alongside sourcing from our farmer network, EPHAAG Farms runs its own company-owned farms across livestock and crops. What we grow feeds directly into the same supply pool we sell from — so output is never dependent on one side alone."
        badge="🌾"
      />
      <RoomBackLink to="/" label="Back to home" />
      <ServiceCardGrid items={cards} theme={themes.farmProduction} />
    </div>
  );
}
