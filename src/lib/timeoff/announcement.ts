// Turning one holiday into an announcement draft (spec 037). Server-side, but pure apart
// from reading the holiday set: it composes the break shape (lib/timeoff/breaks) and the
// wording (lib/email/templates) so the composer page, the send action and the dashboard
// banner all describe the same calendar from one place.

import { describeBreak, addDays, type BreakShape } from "@/lib/timeoff/breaks";
import { isWeekend } from "@/lib/workdays";
import { draftHolidayAnnouncement } from "@/lib/email/templates";
import { formatDate } from "@/lib/labels";
import { dayKey } from "@/lib/workdays";

const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Egyptian everyday forms — الاتنين/التلات/الأربع, not the MSA الإثنين/الثلاثاء/الأربعاء.
const WEEKDAY_AR = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

/** "Monday 13/04/2026" — the weekday matters here; the date format stays the house dd/mm/yyyy. */
export function withWeekday(d: Date): string {
  return `${WEEKDAY_EN[d.getUTCDay()]} ${formatDate(d)}`;
}

export function withWeekdayAr(d: Date): string {
  return `${WEEKDAY_AR[d.getUTCDay()]} ${formatDate(d)}`;
}

function spanEn(start: Date, end: Date): string {
  return start.getTime() === end.getTime()
    ? withWeekday(start)
    : `${withWeekday(start)} to ${withWeekday(end)}`;
}

function spanAr(start: Date, end: Date): string {
  return start.getTime() === end.getTime()
    ? `يوم ${withWeekdayAr(start)}`
    : `من ${withWeekdayAr(start)} لحد ${withWeekdayAr(end)}`;
}

export type AnnouncementDraft = {
  subject: string;
  bodyEn: string;
  bodyAr: string;
  shape: BreakShape;
  /** What the call-to-action should book, or null when there is no bridge to suggest. */
  suggested: { startISO: string; endISO: string; label: string; labelAr: string } | null;
  /** yyyy-mm-dd bridge days, for the announcement record. */
  bridgeISO: string[];
};

/**
 * Build the editable draft for one holiday. `holidays` is the full day-set (which already
 * includes this holiday), so the break walk sees the real calendar around it.
 */
export function buildAnnouncementDraft(
  holiday: { name: string; localName?: string | null; actualStart: Date; actualEnd: Date },
  holidays: ReadonlySet<string>,
  opts: { isCorrection?: boolean } = {}
): AnnouncementDraft {
  const shape = describeBreak(holiday.actualStart, holiday.actualEnd, holidays);

  // Does this holiday actually give anyone a day off? If every one of its days is already a
  // Fri/Sat, it adds nothing, and the draft has to say so instead of inviting people to rest.
  let fallsOnWeekendOnly = true;
  for (let d = holiday.actualStart; d.getTime() <= holiday.actualEnd.getTime(); d = addDays(d, 1)) {
    if (!isWeekend(d)) {
      fallsOnWeekendOnly = false;
      break;
    }
  }

  const { subject, bodyEn, bodyAr } = draftHolidayAnnouncement({
    holidayName: holiday.name,
    localName: holiday.localName ?? null,
    holidayWhen: spanEn(holiday.actualStart, holiday.actualEnd),
    holidayWhenAr: spanAr(holiday.actualStart, holiday.actualEnd),
    bridges: shape.bridges.map(withWeekday),
    bridgesAr: shape.bridges.map(withWeekdayAr),
    stretch: shape.bridges.length ? `from ${formatDate(shape.stretchStart)} to ${formatDate(shape.stretchEnd)}` : null,
    stretchAr: shape.bridges.length
      ? `من ${formatDate(shape.stretchStart)} لحد ${formatDate(shape.stretchEnd)}`
      : null,
    stretchDays: shape.bridges.length ? shape.stretchDays : shape.totalDaysOff,
    isCorrection: !!opts.isCorrection,
    fallsOnWeekendOnly,
  });

  const suggested = shape.suggested
    ? {
        startISO: dayKey(shape.suggested.start),
        endISO: dayKey(shape.suggested.end),
        label: formatDate(shape.suggested.start),
        labelAr: formatDate(shape.suggested.start),
      }
    : null;

  return {
    subject,
    bodyEn,
    bodyAr,
    shape,
    suggested,
    bridgeISO: shape.bridges.map(dayKey),
  };
}
