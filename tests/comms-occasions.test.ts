/**
 * Birthdays and joining anniversaries — pure, no database.
 *
 * Three things are protected, and each one is a way a warm feature turns into an embarrassing one:
 * a birthday message that states an age, a leap-year birthday that silently never happens, and a
 * message to somebody who has left.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hasPassed,
  observedDate,
  occasionsInWindow,
  type OccasionSubject,
} from "@/lib/comms/occasions";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const person = (over: Partial<OccasionSubject> = {}): OccasionSubject => ({
  id: "u1",
  name: "Karim Hassan",
  status: "ACTIVE",
  dateOfBirth: null,
  startDate: null,
  ...over,
});

describe("anniversaries", () => {
  test("five years of service reads as five", () => {
    const found = occasionsInWindow(
      [person({ startDate: utc("2021-09-07") })],
      utc("2026-09-04"),
      utc("2026-09-07")
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, "WORK_ANNIVERSARY");
    assert.equal(found[0].years, 5);
    assert.deepEqual(found[0].occasionDate, utc("2026-09-07"));
  });

  test("a first day is not an anniversary", () => {
    const found = occasionsInWindow(
      [person({ startDate: utc("2026-09-07") })],
      utc("2026-09-04"),
      utc("2026-09-07")
    );
    assert.deepEqual(found, []);
  });

  test("a future start date produces nothing", () => {
    const found = occasionsInWindow(
      [person({ startDate: utc("2027-01-10") })],
      utc("2026-09-04"),
      utc("2026-09-10")
    );
    assert.deepEqual(found, []);
  });
});

describe("birthdays never carry an age", () => {
  test("a birthday has no years, at all", () => {
    const found = occasionsInWindow(
      [person({ dateOfBirth: utc("1990-03-14") })],
      utc("2026-03-11"),
      utc("2026-03-14")
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, "BIRTHDAY");
    assert.equal(found[0].years, undefined, "a birthday must not carry a number");
    assert.ok(!("years" in found[0]) || found[0].years === undefined);
  });

  test("no date of birth means no birthday — nothing is inferred", () => {
    const found = occasionsInWindow(
      [person({ dateOfBirth: null, startDate: utc("2020-01-01") })],
      utc("2026-01-01"),
      utc("2026-12-31")
    );
    assert.ok(found.every((o) => o.kind !== "BIRTHDAY"));
  });
});

describe("29 February", () => {
  test("observed on the 29th in a leap year", () => {
    assert.deepEqual(observedDate(utc("2000-02-29"), 2028), utc("2028-02-29"));
  });

  test("observed on the 28th in a year that has no 29th", () => {
    assert.deepEqual(observedDate(utc("2000-02-29"), 2027), utc("2027-02-28"));
  });

  test("2100 is not a leap year — the century rule holds", () => {
    assert.deepEqual(observedDate(utc("2000-02-29"), 2100), utc("2100-02-28"));
  });

  test("a leap-day birthday is found every single year", () => {
    for (const year of [2026, 2027, 2028, 2029]) {
      const found = occasionsInWindow(
        [person({ dateOfBirth: utc("1996-02-29") })],
        utc(`${year}-02-25`),
        utc(`${year}-03-02`)
      );
      assert.equal(found.length, 1, `${year} produced nothing`);
    }
  });
});

describe("who is excluded", () => {
  test("a leaver gets nothing — not a birthday, not an anniversary", () => {
    const found = occasionsInWindow(
      [person({ status: "LEFT", dateOfBirth: utc("1990-03-14"), startDate: utc("2020-03-14") })],
      utc("2026-03-11"),
      utc("2026-03-14")
    );
    assert.deepEqual(found, []);
  });
});

describe("the window", () => {
  test("is inclusive at both ends", () => {
    const p = [person({ dateOfBirth: utc("1990-03-14") })];
    assert.equal(occasionsInWindow(p, utc("2026-03-14"), utc("2026-03-14")).length, 1);
    assert.equal(occasionsInWindow(p, utc("2026-03-15"), utc("2026-03-18")).length, 0);
  });

  test("straddles the new year — a 2 January birthday is found from 30 December", () => {
    const found = occasionsInWindow(
      [person({ dateOfBirth: utc("1990-01-02") })],
      utc("2026-12-30"),
      utc("2027-01-02")
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].occasionYear, 2027, "it belongs to the year it happens in");
  });

  test("a person with both dates in the window gets both occasions", () => {
    const found = occasionsInWindow(
      [person({ dateOfBirth: utc("1990-03-14"), startDate: utc("2019-03-16") })],
      utc("2026-03-13"),
      utc("2026-03-17")
    );
    assert.equal(found.length, 2);
    assert.deepEqual(found.map((o) => o.kind).sort(), ["BIRTHDAY", "WORK_ANNIVERSARY"]);
  });
});

describe("hasPassed — what closes a draft", () => {
  test("yesterday has passed", () => {
    assert.equal(hasPassed(utc("2026-03-13"), utc("2026-03-14")), true);
  });

  test("today has NOT passed — a message can still go out on the day", () => {
    assert.equal(hasPassed(utc("2026-03-14"), utc("2026-03-14")), false);
  });

  test("tomorrow has not passed", () => {
    assert.equal(hasPassed(utc("2026-03-15"), utc("2026-03-14")), false);
  });
});
