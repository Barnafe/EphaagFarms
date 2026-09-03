// Signature visual motif for every public "service room": a field of
// diagonal furrow lines, evoking plowed rows — literal to the subject
// (a working farm operation), not decorative for its own sake. Themed
// per department via serviceThemes.js.

export default function RoomHero({ theme, eyebrow, title, description, badge }) {
  return (
    <div
      className="relative overflow-hidden py-16 sm:py-20"
      style={{
        background: `linear-gradient(135deg, ${theme.heroFrom}, ${theme.heroTo})`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(-35deg, ${theme.rowColor} 0px, ${theme.rowColor} 2px, transparent 2px, transparent 34px)`,
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6 text-center text-white">
        {badge && (
          <div className="mb-5 flex justify-center">
            <div className={`flex h-14 w-14 rotate-45 items-center justify-center rounded-lg ${theme.badge}`}>
              <span className={`-rotate-45 text-2xl font-semibold ${theme.badgeText}`}>{badge}</span>
            </div>
          </div>
        )}
        {eyebrow && (
          <p className={`mb-3 text-xs font-semibold uppercase tracking-widest ${theme.accent}`}>{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/85 sm:text-base">{description}</p>
        )}
      </div>
    </div>
  );
}
