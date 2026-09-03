import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import ServiceCardGrid from "../../../../components/public-services/ServiceCardGrid.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const cards = [
  {
    to: "/services/trc/training",
    title: "Training",
    description: "Seminars and short courses that raise farming standards, free for members.",
    badge: "🎓",
  },
  {
    to: "/services/trc/research",
    title: "Research",
    description: "Field findings and published research feeding back into how we farm.",
    badge: "🔬",
  },
  {
    to: "/services/trc/consultancy",
    title: "Consultancy",
    description: "One-on-one guidance for farmers planning a season or solving a problem.",
    badge: "🤝",
  },
];

export default function TRCRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.trc}
        eyebrow="Training, Research & Consultancy"
        title="Raising farming standards, one season at a time"
        description="TRC is EPHAAG Farms' knowledge arm — training, published research, and direct consultancy, all free to members and built into how attendance and course progress feed loan eligibility."
        badge="+"
      />
      <RoomBackLink to="/" label="Back to home" />
      <ServiceCardGrid items={cards} theme={themes.trc} />
    </div>
  );
}
