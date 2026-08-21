/**
 * Course renewal — pure, no database.
 *
 * The rule these protect is that lapsing is DERIVED. If any of this drifts, a course either stops
 * coming back when it should or comes back when it shouldn't, and both are invisible until someone
 * notices their training list is wrong.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addMonths, dueAgainAt, hasLapsed, renewalState } from "@/lib/learning/renewal";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("addMonths — clamps rather than rolling over", () => {
  test("31 Jan + 1 month is 28 Feb, not 3 March", () => {
    assert.equal(addMonths(at("2026-01-31"), 1).toISOString().slice(0, 10), "2026-02-28");
  });
  test("29 Feb in a leap year + 12 months is 28 Feb", () => {
    assert.equal(addMonths(at("2024-02-29"), 12).toISOString().slice(0, 10), "2025-02-28");
  });
  test("a normal date is untouched", () => {
    assert.equal(addMonths(at("2026-03-14"), 12).toISOString().slice(0, 10), "2027-03-14");
  });
});

describe("a course with no renewal period never lapses", () => {
  test("null period", () => {
    assert.equal(dueAgainAt(at("2020-01-01"), null), null);
    assert.equal(hasLapsed(at("2020-01-01"), null, at("2030-01-01")), false);
  });
  test("zero or negative is treated as no renewal, not as instant expiry", () => {
    assert.equal(hasLapsed(at("2020-01-01"), 0, at("2030-01-01")), false);
    assert.equal(hasLapsed(at("2020-01-01"), -12, at("2030-01-01")), false);
  });
  test("an incomplete course never lapses", () => {
    assert.equal(hasLapsed(null, 12, at("2030-01-01")), false);
  });
});

describe("annual renewal", () => {
  const done = at("2026-03-14");
  test("due exactly a year later", () => {
    assert.equal(dueAgainAt(done, 12)?.toISOString().slice(0, 10), "2027-03-14");
  });
  test("not lapsed the day before", () => {
    assert.equal(hasLapsed(done, 12, at("2027-03-13")), false);
  });
  test("lapsed ON the due date — the year is up", () => {
    assert.equal(hasLapsed(done, 12, at("2027-03-14")), true);
  });
  test("still lapsed long after", () => {
    assert.equal(hasLapsed(done, 12, at("2030-01-01")), true);
  });
});

describe("renewalState — three states, because 'due soon' reads differently", () => {
  const done = at("2026-03-14");
  test("permanent when no period is set", () => {
    assert.equal(renewalState(done, null).kind, "PERMANENT");
  });
  test("DUE while it is comfortably away", () => {
    const s = renewalState(done, 12, at("2026-09-01"));
    assert.equal(s.kind, "DUE");
  });
  test("DUE_SOON inside the last 30 days", () => {
    const s = renewalState(done, 12, at("2027-03-01"));
    assert.equal(s.kind, "DUE_SOON");
    assert.equal(s.kind === "DUE_SOON" && s.daysLeft, 13);
  });
  test("LAPSED once the date passes", () => {
    assert.equal(renewalState(done, 12, at("2027-04-01")).kind, "LAPSED");
  });
  test("changing the period re-evaluates immediately — no sweep to wait for", () => {
    // Same completion, same 'now'; only the period differs.
    assert.equal(renewalState(done, 24, at("2027-06-01")).kind, "DUE");
    assert.equal(renewalState(done, 12, at("2027-06-01")).kind, "LAPSED");
  });
});
