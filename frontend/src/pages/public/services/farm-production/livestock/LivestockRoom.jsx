import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import ServiceCardGrid from "../../../../../components/public-services/ServiceCardGrid.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

const cards = [
  {
    to: "/services/farm-production/livestock/poultry",
    title: "Poultry farming",
    description: "Broilers and layers raised for meat and egg supply, managed under strict biosecurity.",
    badge: "🐔",
  },
  {
    to: "/services/farm-production/livestock/fish-aquaculture",
    title: "Fish & aquaculture",
    description: "Pond and tank-based fish farming, primarily catfish and tilapia.",
    badge: "🐟",
  },
  {
    to: "/services/farm-production/livestock/cattle",
    title: "Cattle farming",
    description: "Beef and dairy cattle raised for meat, milk and breeding stock.",
    badge: "🐄",
  },
  {
    to: "/services/farm-production/livestock/goat-sheep",
    title: "Goat & sheep farming",
    description: "Small ruminants raised for meat, well suited to smaller-scale, lower-cost production.",
    badge: "🐐",
  },
];

export default function LivestockRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Farm production → Livestock farming"
        title="Livestock farming"
        description="Company-owned livestock operations across poultry, fish, cattle and small ruminants — each run to its own husbandry standard, feeding directly into what we supply to buyers."
        badge="🐄"
      />
      <RoomBackLink to="/services/farm-production" label="Farm production" />
      <ServiceCardGrid items={cards} theme={themes.farmProduction} />
    </div>
  );
}
