import type { SystemPack } from "@/lib/reviews/pack";

/**
 * Facts the platform already holds, so a review starts from the same picture
 * rather than from memory.
 *
 * Deliberately plain: no score, no rating, no traffic light, no comparison with
 * anyone else. A review is the worst place for a number that implies a judgement
 * nobody agreed to — and no monetary figure appears here or anywhere else in
 * this module.
 */
export function SystemPackTiles({ pack }: { pack: SystemPack }) {
  const tiles: { value: string; label: string }[] = [
    { value: String(pack.workingDaysTaken), label: "Days off taken" },
  ];

  if (pack.learning.completedInQuarter > 0 || pack.learning.inProgress > 0) {
    tiles.push({
      value: String(pack.learning.completedInQuarter),
      label: "Courses finished",
    });
    if (pack.learning.inProgress > 0) {
      tiles.push({ value: String(pack.learning.inProgress), label: "Courses open" });
    }
  }

  // Only while onboarding is unfinished — a completed tracker is clutter, not a
  // fact about the quarter.
  if (pack.onboarding) {
    tiles.push({
      value: `${pack.onboarding.done}/${pack.onboarding.total}`,
      label: "Onboarding",
    });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="min-w-[118px] rounded-lg border border-line bg-paper px-3 py-2"
        >
          <div className="text-lg font-bold leading-tight tabular-nums text-navy-900">
            {t.value}
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}
