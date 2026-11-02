import { useEffect, useState } from "react";
import ConsultancyApply from "../ConsultancyApply.jsx";

// The public Consultancy block: one short note and a small "Book appointment" button
// at the bottom right. The button opens the booking form. Anyone can book, no account needed.
export default function ConsultancyCard({ heading = "Consultancy", headingClass = "text-sm text-ink-600" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="card" data-testid="home-consultancy">
      <p className={headingClass}>{heading}</p>
      <p className="mt-2 text-sm text-ink-900">Have one-on-one guidance with Ephaag experts.</p>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primary px-4 py-1.5 text-xs" data-testid="book-appointment" onClick={() => setOpen(true)}>
          Book appointment
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Book appointment" onClick={() => setOpen(false)}>
          <div className="my-8 w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button type="button" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-900" onClick={() => setOpen(false)}>Close</button>
            </div>
            <ConsultancyApply />
          </div>
        </div>
      )}
    </div>
  );
}
