export default function AllocationTaskList({ tasks, onConfirm }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your allocation tasks</p>
      <div className="mt-3 space-y-2">
        {tasks.length === 0 && <p className="text-sm text-ink-600">Nothing assigned yet.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="rounded-card border border-soil-200 px-3 py-3">
            <p className="text-xs font-medium text-canopy-800">{t.orderReference}</p>
            <p className="mt-1 text-sm text-ink-900">
              {t.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
            </p>
            <p className="text-xs text-ink-600">To {t.deliveryLocation}</p>

            {t.status === "assigned" ? (
              <button
                className="btn-primary mt-2"
                type="button"
                onClick={() => onConfirm(t.id)}
              >
                Confirm ready for pickup
              </button>
            ) : (
              <p className="mt-2 text-xs text-canopy-800">Confirmed — handed to Transport</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
