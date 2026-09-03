export default function StandardPriceList({ prices }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Current standardized prices</p>
      <div className="mt-3 space-y-1">
        {prices.map((p) => (
          <div key={p.crop} className="flex justify-between text-sm">
            <span className="text-ink-900">{p.crop}</span>
            <span className="text-ink-600">₦{p.price.toLocaleString()} / {p.unit}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-600">
        Prices are set by Ephaag Farms' governance process, not negotiable per order.
      </p>
    </div>
  );
}
