import Link from "next/link";
import { formatDate } from "@/lib/labels";

/**
 * The upcoming-holiday banner on the dashboard (spec 037, FR-012 — mockup signed off
 * 2026-08-19). Server-rendered from live state, so someone who joined after the email went
 * out still sees it, and it disappears by itself once the holiday has passed.
 *
 * Rendered only when the holiday has actually been announced: this is the same message the
 * team was sent, not a preview of HR's unsent draft.
 */
export function HolidayBanner({
  name,
  start,
  end,
  bridgeDays,
  stretchStart,
  stretchEnd,
  stretchDays,
}: {
  name: string;
  start: Date;
  end: Date;
  /** Bridge days called out in the announcement; empty when the calendar offered none. */
  bridgeDays: Date[];
  stretchStart: Date;
  stretchEnd: Date;
  stretchDays: number;
}) {
  const when =
    start.getTime() === end.getTime()
      ? formatDate(start)
      : `${formatDate(start)} → ${formatDate(end)}`;
  const hasBridge = bridgeDays.length > 0;

  return (
    <section className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-gold-300 bg-gradient-to-b from-gold-100 to-surface px-5 py-4">
      <div className="min-w-[250px] flex-1">
        <p className="font-serif text-lg text-ink">
          {name} — {when}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {hasBridge ? (
            <>
              <b className="text-ink">
                {bridgeDays.map((d) => formatDate(d)).join(" and ")}{" "}
                {bridgeDays.length === 1 ? "is a bridge" : "are bridges"}
              </b>{" "}
              — take {bridgeDays.length === 1 ? "that day" : "those days"} and you&apos;re off from{" "}
              {formatDate(stretchStart)} through {formatDate(stretchEnd)}.
            </>
          ) : stretchDays >= 3 ? (
            <>
              <b className="text-ink">{stretchDays} days off in a row</b> with the weekend — time to
              rest properly.
            </>
          ) : (
            <>A day off is coming — make the most of it.</>
          )}
        </p>
      </div>
      {hasBridge ? (
        <Link
          href={`/time-off?start=${bridgeDays[0].toISOString().slice(0, 10)}&end=${bridgeDays[bridgeDays.length - 1]
            .toISOString()
            .slice(0, 10)}`}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Request {formatDate(bridgeDays[0])} off →
        </Link>
      ) : null}
    </section>
  );
}
