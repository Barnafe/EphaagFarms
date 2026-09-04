import { CheckCircle2 } from "lucide-react";

export default function OrderConfirmation({ order, onContinue }) {
  return (
    <div className="on-light rounded-card border border-soil-200 bg-white p-6 text-center space-y-1">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-canopy-50 text-canopy-700">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <p className="mt-2 text-sm text-canopy-700">Order placed</p>
      <p className="text-2xl font-medium text-gray-900">{order.reference}</p>
      <p className="mt-1 text-sm text-gray-500">
        Save this reference — it tracks this order through sourcing, transport, and delivery.
      </p>
      <p className="mt-3 text-sm text-gray-700">
        ₦{order.total.toLocaleString()} · {order.deliveryLocation}
      </p>
      <button className="btn-primary mt-5" type="button" onClick={onContinue}>
        Continue shopping
      </button>
    </div>
  );
}
