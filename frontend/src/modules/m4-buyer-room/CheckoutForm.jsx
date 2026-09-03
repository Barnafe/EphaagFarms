import { useState } from "react";

// The "menu to input details" step of checkout — delivery address, two
// contact numbers, and an email, prefilled from the buyer's profile where
// possible but editable per order. Payment method choice (upfront vs
// standing balance) lives here too when a commitment is active. Hands off
// to the payment step on submit — this step itself never charges anything.
export default function CheckoutForm({ cart, commitment, defaultAddress, defaultEmail, onBack, onContinue }) {
  const [location, setLocation] = useState(defaultAddress || "");
  const [contactPhone1, setContactPhone1] = useState("");
  const [contactPhone2, setContactPhone2] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultEmail || "");
  const [payMethod, setPayMethod] = useState(commitment.active ? "balance" : "upfront");

  const total = cart.reduce((sum, line) => sum + line.lineTotal, 0);
  const canUseBalance = commitment.active && commitment.balanceRemaining >= total;

  const valid = location && contactPhone1 && contactPhone2 && contactEmail && !(payMethod === "balance" && !canUseBalance);

  function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    onContinue({ deliveryLocation: location, contactPhone1, contactPhone2, contactEmail, paidVia: payMethod });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-soil-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Checkout details</p>
        <button type="button" onClick={onBack} className="text-sm text-canopy-800">
          ← Back to cart
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Delivery address</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Street, city, state — specific address to be delivered"
            required
            className="w-full rounded-card border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Contact phone 1</label>
            <input
              type="tel"
              value={contactPhone1}
              onChange={(e) => setContactPhone1(e.target.value)}
              placeholder="080..."
              required
              className="w-full rounded-card border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Contact phone 2</label>
            <input
              type="tel"
              value={contactPhone2}
              onChange={(e) => setContactPhone2(e.target.value)}
              placeholder="080... (backup contact)"
              required
              className="w-full rounded-card border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-card border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
          />
        </div>

        {commitment.active && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Payment method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full rounded-card border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
            >
              <option value="balance">Draw from standing balance</option>
              <option value="upfront">Pay upfront for this order</option>
            </select>
            {payMethod === "balance" && !canUseBalance && (
              <p className="mt-1 text-xs text-harvest-600">
                Standing balance isn't enough for this order — choose upfront payment instead.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-card bg-soil-50 px-3 py-2.5 text-sm">
        <span className="text-gray-600">Total to pay</span>
        <span className="font-semibold text-gray-900">₦{total.toLocaleString()}</span>
      </div>

      <button className="btn-primary w-full" type="submit" disabled={!valid}>
        Proceed to payment
      </button>
    </form>
  );
}
