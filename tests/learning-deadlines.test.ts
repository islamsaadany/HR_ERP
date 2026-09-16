/**
 * Learning deadlines — the one derivation that turns two kinds of deadline into one date.
 *
 * Pure, no database. These cases exist because the failure they guard against is invisible: a
 * second resolution written for a screen would mean a person is told one date and chased on
 * another, and nothing would report it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_SCHEDULE,
  daysOverdue,
  earliestDeadline,
  isOverdue,
  isReminderDay,
  resolveDeadline,
} from "@/lib/learning/deadlines";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("the two kinds resolve to one date", () => {
  test("a period counts from the day they joined the track", () => {
    const due = resolveDeadline({ dueDays: 30, dueOn: null }, d("2026-09-01"));
    assert.equal(due?.toISOString(), d("2026-10-01").toISOString());
  });

  test("a fixed date is the same for everybody, whenever they joined", () => {
    const a = resolveDeadline({ dueDays: null, dueOn: d("2026-12-31") }, d("2026-01-05"));
    const b = resolveDeadline({ dueDays: null, dueOn: d("2026-12-31") }, d("2026-11-20"));
    assert.equal(a?.toISOString(), b?.toISOString());
  });

  test("a joining TIME of day does not shift the deadline — a deadline is a day", () => {
    const early = resolveDeadline({ dueDays: 7, dueOn: null }, new Date("2026-09-01T00:05:00Z"));
    const late = resolveDeadline({ dueDays: 7, dueOn: null }, new Date("2026-09-01T23:55:00Z"));
    assert.equal(early?.toISOString(), late?.toISOString());
  });

  test("no deadline resolves to null, and null is NOT overdue", () => {
    assert.equal(resolveDeadline({ dueDays: null, dueOn: null }, d("2026-09-01")), null);
    assert.equal(isOverdue(null, null, d("2030-01-01")), false);
  });
});

describe("a course in two tracks", () => {
  test("the earlier deadline governs — work added never pushes a date later", () => {
    const earliest = earliestDeadline([d("2026-12-31"), d("2026-10-01"), null]);
    assert.equal(earliest?.toISOString(), d("2026-10-01").toISOString());
  });

  test("a period and a fixed date are compared only once both are real dates", () => {
    const period = resolveDeadline({ dueDays: 10, dueOn: null }, d("2026-09-01")); // 11 Sep
    const fixed = resolveDeadline({ dueDays: null, dueOn: d("2026-12-31") }, d("2026-09-01"));
    assert.equal(earliestDeadline([period, fixed])?.toISOString(), d("2026-09-11").toISOString());
  });

  test("no deadlines at all stays null", () => {
    assert.equal(earliestDeadline([null, null]), null);
  });
});

describe("overdue is derived, never stored", () => {
  const due = d("2026-09-10");

  test("not overdue on the day itself", () => {
    assert.equal(isOverdue(due, null, d("2026-09-10")), false);
  });

  test("overdue the day after", () => {
    assert.equal(isOverdue(due, null, d("2026-09-11")), true);
  });

  test("completing it stops it being overdue, with nothing written", () => {
    assert.equal(isOverdue(due, d("2026-09-09"), d("2026-12-01")), false);
  });
});

describe("the reminder bound", () => {
  test("five messages and no more", () => {
    assert.equal(REMINDER_SCHEDULE.length, 5);
  });

  test("the schedule days chase, and nothing else does", () => {
    for (const day of REMINDER_SCHEDULE) assert.equal(isReminderDay(day), true, String(day));
    for (const day of [1, 6, 8, 27, 29, 35, 100]) {
      assert.equal(isReminderDay(day), false, String(day));
    }
  });

  test("a missed day does NOT catch up the next day", () => {
    // A week's outage must not produce five emails in one morning.
    assert.equal(isReminderDay(8), false);
    assert.equal(isReminderDay(9), false);
  });

  test("days overdue counts whole days", () => {
    assert.equal(daysOverdue(d("2026-09-10"), d("2026-09-17")), 7);
    assert.equal(daysOverdue(d("2026-09-10"), d("2026-09-10")), 0);
  });
});
