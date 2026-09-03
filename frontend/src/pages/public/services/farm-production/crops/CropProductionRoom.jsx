import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import ServiceCardGrid from "../../../../../components/public-services/ServiceCardGrid.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

const cards = [
  {
    to: "/services/farm-production/crops/grains",
    title: "Grains",
    description: "Maize, rice, sorghum and millet grown across company-owned farmland.",
    badge: "🌽",
  },
  {
    to: "/services/farm-production/crops/tubers",
    title: "Tubers",
    description: "Cassava, yam and sweet potato, grown and harvested on rotation.",
    badge: "🥔",
  },
  {
    to: "/services/farm-production/crops/vegetables",
    title: "Vegetables",
    description: "Tomatoes, peppers, onions and leafy greens grown for fresh supply.",
    badge: "🍅",
  },
  {
    to: "/services/farm-production/crops/fruits-cash-crops",
    title: "Fruits & cash crops",
    description: "Fruit orchards and cash crops such as groundnut and soybean.",
    badge: "🍊",
  },
];

export default function CropProductionRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Farm production → Crop production"
        title="Crop production"
        description="Company-owned farmland growing grains, tubers, vegetables and cash crops, planted and harvested on a rotation that keeps supply flowing through the year."
        badge="🌾"
      />
      <RoomBackLink to="/services/farm-production" label="Farm production" />
      <ServiceCardGrid items={cards} theme={themes.farmProduction} />
    </div>
  );
}
