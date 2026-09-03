import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const stages = [
  { step: "1", title: "Payment confirmed", desc: "Finance confirms your payment and the order enters the pipeline." },
  { step: "2", title: "Sourced", desc: "Procurement matches your order to farmers by crop and location — splitting across multiple farmers if needed." },
  { step: "3", title: "Processed", desc: "Every order passes through a Processor before it moves onward." },
  { step: "4", title: "Allocated", desc: "Store Department allocates a Distributor to handle onward distribution." },
  { step: "5", title: "In transit", desc: "Transport Department assigns a driver, who picks up and delivers." },
  { step: "6", title: "Delivered", desc: "Delivery is confirmed with proof, and the order is complete." },
];

export default function LogisticsRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.logistics}
        eyebrow="Logistics & tracking"
        title="Every order, tracked from confirmation to your door"
        description="Once your payment is confirmed, your order moves through a fixed sequence of stages — sourcing, processing, allocation and delivery — each one visible in your order history as it happens."
        badge="⇒"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">The order pipeline</h2>
          <div className="mt-5 space-y-4">
            {stages.map((s) => (
              <div key={s.step} className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-harvest-400">
                  {s.step}
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-ink-900">{s.title}</p>
                  <p className="mt-0.5 text-sm text-ink-600">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Tracking your order</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Every order gets a unique reference number the moment it's placed — for example{" "}
            <span className="font-mono text-ink-900">ORD-20260723-4F2K</span> — and shipments get
            their own reference once a driver is assigned. Your order history shows the current
            stage at a glance, so you always know exactly where things stand without needing to
            call in.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">Proof of delivery</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            When your driver delivers, proof of delivery is captured and attached to the
            shipment — so the order isn't marked complete until delivery is actually confirmed
            on the ground.
          </p>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-ink-900 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to place an order?</h3>
          <p className="mt-2 text-sm text-harvest-50/90">Register as a buyer to browse the catalog and start tracking.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-ink-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
