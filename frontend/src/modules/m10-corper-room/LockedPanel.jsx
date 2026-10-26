import { Lock } from "lucide-react";

export default function LockedPanel({ title, body }) {
  return (
    <div className="rounded-card border border-dashed border-soil-200 bg-white p-8 text-center">
      <Lock className="mx-auto text-[#a68a55]" size={28} aria-hidden="true" />
      <h2 className="mt-3 font-display text-xl font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-800">{body}</p>
    </div>
  );
}
