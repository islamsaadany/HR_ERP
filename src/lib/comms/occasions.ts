import type { MessageKind } from "@prisma/client";

/**
 * Birthdays and joining anniversaries (spec 039, research D9).
 *
 * Both come from dates the registry already holds — `dateOfBirth` and `startDate`. Nothing new is
 * asked of anybody, and nothing is inferred: somebody with no date of birth simply has no birthday
 * here, rather than one guessed from a hire date or a national ID.
 *
 * TWO RULES THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 *  1. A birthday carries NO number. An anniversary carries years, because years of service is the
 *     thing being thanked; an age is nobody's business and printing one is how a warm message
 *     becomes an unwelcome one. The type below makes `years` optional and the birthday branch
 *     never sets it — the model refuses to hold an age rather than merely declining to print it.
 *
 *  2. A 29 February birthday is OBSERVED on 28 February in a non-leap year. Skipping it means
 *     three people in four get nothing and nobody notices, because the person it happens to is
 *     used to their birthday being awkward and will not complain.
 *
 * Pure: no Prisma, no clock of its own. `from`/`to` are passed in so this is testable.
 */

export type OccasionSubject = {
  id: string;
  name: string;
  status: string;
  dateOfBirth: Date | null;
  startDate: Date | null;
};

export type PreparedOccasion = {
  userId: string;
  name: string;
  kind: Extract<MessageKind, "BIRTHDAY" | "WORK_ANNIVERSARY">;
  /** Calendar year the occasion falls in — half of the idempotence key. */
  occasionYear: number;
  /** The date it is OBSERVED on, which is not always the anniversary of the original. */
  occasionDate: Date;
  /** Years of service. Never set for a birthday. */
  years?: number;
};

/** UTC midnight of a date, so day arithmetic never drifts on a timezone. */
function dayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The date an anniversary of `original` is observed in `year`.
 *
 * Everything except 29 February is the same day and month. 29 February becomes 28 February in a
 * year that has no 29th — see rule 2 above.
 */
export function observedDate(original: Date, year: number): Date {
  const month = original.getUTCMonth();
  const day = original.getUTCDate();
  const isLeapDay = month === 1 && day === 29;
  const useDay = isLeapDay && !isLeapYear(year) ? 28 : day;
  return new Date(Date.UTC(year, month, useDay));
}

/** Whether `date` falls inside [from, to], inclusive at both ends. */
function within(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/**
 * Every occasion falling in the window, for the people given.
 *
 * The window can straddle a year boundary (late December looking into January), so each person is
 * checked against the occasion in the `from` year AND the `to` year rather than just one.
 */
export function occasionsInWindow(
  people: OccasionSubject[],
  from: Date,
  to: Date
): PreparedOccasion[] {
  const start = dayUtc(from);
  const end = dayUtc(to);
  const years = [start.getUTCFullYear(), end.getUTCFullYear()].filter(
    (y, i, a) => a.indexOf(y) === i
  );

  const out: PreparedOccasion[] = [];

  for (const person of people) {
    // A leaver gets nothing. Not a birthday, not an anniversary — they do not work here.
    if (person.status !== "ACTIVE") continue;

    for (const year of years) {
      if (person.dateOfBirth) {
        const date = observedDate(person.dateOfBirth, year);
        if (within(date, start, end)) {
          out.push({
            userId: person.id,
            name: person.name,
            kind: "BIRTHDAY",
            occasionYear: year,
            occasionDate: date,
            // Deliberately no `years`. See rule 1.
          });
        }
      }

      if (person.startDate) {
        const started = dayUtc(person.startDate);
        const years_ = year - started.getUTCFullYear();
        // A person's first day is not an anniversary, and neither is a future start date.
        if (years_ >= 1) {
          const date = observedDate(started, year);
          if (within(date, start, end)) {
            out.push({
              userId: person.id,
              name: person.name,
              kind: "WORK_ANNIVERSARY",
              occasionYear: year,
              occasionDate: date,
              years: years_,
            });
          }
        }
      }
    }
  }

  return out;
}

/** Whether a prepared occasion's day has passed — what closes a draft as missed. */
export function hasPassed(occasionDate: Date, today: Date): boolean {
  return dayUtc(occasionDate).getTime() < dayUtc(today).getTime();
}
