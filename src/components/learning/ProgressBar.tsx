import { barClasses } from "@/components/learning/ui";

/**
 * The one progress bar. Renders the figure next to the bar in tabular numerals so a column of
 * them lines up, and turns green only at 100% — a part-done course is navy, because green is
 * reserved for done-states across the whole app.
 */
export function ProgressBar({
  percent,
  width = 190,
  showFigure = true,
}: {
  percent: number;
  width?: number;
  showFigure?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  const c = barClasses(safe);
  return (
    <div className="flex items-center gap-2">
      <div
        className={c.track}
        style={{ width }}
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={c.fill} style={{ width: `${safe}%` }} />
      </div>
      {showFigure ? (
        <span className="min-w-[38px] text-right text-xs font-bold tabular-nums text-navy-800">
          {safe}%
        </span>
      ) : null}
    </div>
  );
}
