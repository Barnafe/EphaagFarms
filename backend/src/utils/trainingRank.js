// Training-completion rank — distinct from the leadership rank in
// farmer_profiles.rank (Unit Leader/Ward Leader/etc). This one is earned
// by completed training CYCLES (calendar quarters with at least one
// cleared attendance), not individual sessions — corrected 2026-08-11
// after the user clarified trainings happen 2x/month (~24/year). Ranking
// by raw session count would blow through every tier in ~6 weeks, so
// tiers now advance one per QUARTER engaged with, matching the same
// quarterly cadence the loan grading indices use. See
// [[ephaag-farms-farmer-room-specs]] memory for the full reasoning —
// this is Claude's judgment call to fix the pacing problem, not something
// the user specified in these exact terms, flagged to them accordingly.
//
// 0 quarters -> Novice
// 1 -> Mastery
// 2 -> Professional
// 3 -> Executive (last named tier)
// 4+ -> Executive 1 Step N, counting indefinitely (N = quarters - 3)
export function trainingRankLabel(quartersEngaged) {
  const n = Number(quartersEngaged) || 0;
  if (n <= 0) return "Novice";
  if (n === 1) return "Mastery";
  if (n === 2) return "Professional";
  if (n === 3) return "Executive";
  return `Executive 1 Step ${n - 3}`;
}

// What the farmer needs to do to reach the next tier, for named tiers only
// (once in the "Executive 1 Step N" range it's just "engage with one more
// quarter").
export function nextTrainingRankLabel(quartersEngaged) {
  const n = Number(quartersEngaged) || 0;
  if (n === 0) return "Mastery";
  if (n === 1) return "Professional";
  if (n === 2) return "Executive";
  return `Executive 1 Step ${n - 2}`;
}
