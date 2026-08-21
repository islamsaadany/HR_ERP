/**
 * Audience rules — pure, no database.
 *
 * Two things are protected here.
 *
 * 1. A tenure audience must read the DERIVED band (from the hire date), never the stored
 *    `User.tenureBand` column, which goes stale the moment somebody crosses a boundary.
 * 2. The rule has TWO encodings — a Prisma `where` clause for the per-course direction and an
 *    in-memory predicate for the per-person direction. The final describe block is what stops them
 *    drifting apart, which would be an access-control bug rather than an untidiness.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { TenureBand } from "@prisma/client";
import {
  audienceWhere,
  bandStartDateRange,
  reachesNobody,
  subjectMatchesAudience,
  type AudienceRule,
  type AudienceSubject,
} from "@/lib/learning/audience";
import { deriveTenureBand } from "@/lib/tenure";

const NOW = new Date("2026-08-21T00:00:00Z");
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const hiredYearsAgo = (y: number) => new Date(NOW.getTime() - y * YEAR_MS);

const person = (over: Partial<AudienceSubject> = {}): AudienceSubject => ({
  status: "ACTIVE",
  department: "Consulting",
  businessUnitId: "bu-1",
  employmentType: "FULL_TIME",
  tenureBand: null,
  startDate: hiredYearsAgo(3),
  reportsToId: "mgr-1",
  ...over,
});

describe("bandStartDateRange — agrees with deriveTenureBand, which is the whole point", () => {
  const bands: TenureBand[] = ["BAND_6MO_2Y", "BAND_2_4Y", "BAND_4_7Y", "BAND_7_10Y"];

  test("every band's range selects exactly the hires deriveTenureBand puts in it", () => {
    // Sample hire dates across 15 years; each must land in the range of its own derived band and
    // no other. This is the cross-check that keeps the SQL form honest against lib/tenure.ts.
    for (let months = 1; months <= 180; months++) {
      const hire = new Date(NOW.getTime() - (months / 12) * YEAR_MS);
      const derived = deriveTenureBand(hire, NOW).band;
      for (const band of bands) {
        const { gt, lte } = bandStartDateRange(band, NOW);
        const inRange =
          (!gt || hire.getTime() > gt.getTime()) && (!lte || hire.getTime() <= lte.getTime());
        assert.equal(
          inRange,
          derived === band,
          `hire ${months} months ago: derived ${derived}, but ${band} range said ${inRange}`
        );
      }
    }
  });

  test("someone under six months is in no band's range", () => {
    const hire = hiredYearsAgo(0.25);
    assert.equal(deriveTenureBand(hire, NOW).band, null);
    for (const band of bands) {
      const { gt, lte } = bandStartDateRange(band, NOW);
      const inRange =
        (!gt || hire.getTime() > gt.getTime()) && (!lte || hire.getTime() <= lte.getTime());
      assert.equal(inRange, false, `${band} wrongly claimed a 3-month hire`);
    }
  });

  test("the top band absorbs everyone past ten years", () => {
    const veteran = hiredYearsAgo(14);
    const { gt, lte } = bandStartDateRange("BAND_7_10Y", NOW);
    assert.equal(gt, undefined);
    assert.ok(lte && veteran.getTime() <= lte.getTime());
  });
});

describe("audienceWhere — rules union, and a broken rule never widens access", () => {
  test("no rules reaches nobody — NOT everybody", () => {
    // The failure mode worth naming: returning an empty `where` here would match the whole
    // company, turning a course with no audience into a company-wide disclosure.
    assert.equal(audienceWhere([], NOW), null);
    assert.equal(reachesNobody([]), true);
  });

  test("a rule needing a value but missing one is dropped, not treated as match-all", () => {
    assert.equal(audienceWhere([{ kind: "DEPARTMENT", value: null }], NOW), null);
    assert.equal(audienceWhere([{ kind: "TENURE_BAND", value: "NOT_A_BAND" }], NOW), null);
    assert.equal(audienceWhere([{ kind: "EMPLOYMENT_TYPE", value: "CONTRACTOR" }], NOW), null);
  });

  test("ALL_ACTIVE collapses to the plain active filter", () => {
    const w = audienceWhere([{ kind: "ALL_ACTIVE", value: null }], NOW);
    assert.deepEqual(w, { status: "ACTIVE" });
  });

  test("ALL_ACTIVE alongside others still collapses — it subsumes them", () => {
    const w = audienceWhere(
      [{ kind: "DEPARTMENT", value: "Finance" }, { kind: "ALL_ACTIVE", value: null }],
      NOW
    );
    assert.deepEqual(w, { status: "ACTIVE" });
  });

  test("several rules OR together under an ACTIVE filter", () => {
    const w = audienceWhere(
      [{ kind: "DEPARTMENT", value: "Consulting" }, { kind: "EMPLOYMENT_TYPE", value: "PART_TIME" }],
      NOW
    );
    assert.deepEqual(w, {
      AND: [
        { status: "ACTIVE" },
        { OR: [{ department: "Consulting" }, { employmentType: "PART_TIME" }] },
      ],
    });
  });
});

describe("missing registry data matches nothing and raises nothing (FR-016)", () => {
  const rules: AudienceRule[] = [
    { kind: "DEPARTMENT", value: "Consulting" },
    { kind: "BUSINESS_UNIT", value: "bu-1" },
    { kind: "EMPLOYMENT_TYPE", value: "FULL_TIME" },
    { kind: "TENURE_BAND", value: "BAND_2_4Y" },
    { kind: "REPORTS_TO", value: "mgr-1" },
  ];

  test("an employee with every optional field null matches none of them", () => {
    const blank = person({
      department: null,
      businessUnitId: null,
      employmentType: null,
      startDate: null,
      reportsToId: null,
    });
    assert.equal(subjectMatchesAudience(blank, rules, NOW), false);
  });

  test("a leaver is in no audience, even one they would otherwise match (FR-017)", () => {
    assert.equal(subjectMatchesAudience(person({ status: "LEFT" }), rules, NOW), false);
  });

  test("a brand-new hire matches nothing tenure-based", () => {
    const newJoiner = person({ startDate: hiredYearsAgo(0.1), department: null, businessUnitId: null, employmentType: null, reportsToId: null });
    assert.equal(subjectMatchesAudience(newJoiner, [{ kind: "TENURE_BAND", value: "BAND_6MO_2Y" }], NOW), false);
  });
});

describe("the two encodings agree — the guard against a silent access bug", () => {
  // A small population covering every field's present/absent cases.
  const population: Array<{ id: string; s: AudienceSubject }> = [
    { id: "consulting-ft-3y", s: person() },
    { id: "finance-pt-1y", s: person({ department: "Finance", employmentType: "PART_TIME", startDate: hiredYearsAgo(1) }) },
    { id: "no-department", s: person({ department: null }) },
    { id: "no-type", s: person({ employmentType: null }) },
    { id: "no-start-date", s: person({ startDate: null }) },
    { id: "no-manager", s: person({ reportsToId: null }) },
    { id: "other-bu", s: person({ businessUnitId: "bu-2" }) },
    { id: "veteran-12y", s: person({ startDate: hiredYearsAgo(12) }) },
    { id: "new-joiner", s: person({ startDate: hiredYearsAgo(0.2) }) },
    { id: "leaver", s: person({ status: "LEFT" }) },
  ];

  /** Apply a compiled `where` to the population by hand — the same semantics Postgres would. */
  function selectByWhere(rules: AudienceRule[]): Set<string> {
    const w = audienceWhere(rules, NOW);
    const out = new Set<string>();
    if (!w) return out;
    const terms: Array<Record<string, unknown>> =
      "AND" in w ? ((w.AND as never[])[1] as { OR: Record<string, unknown>[] }).OR : [{}];
    for (const { id, s } of population) {
      if (s.status !== "ACTIVE") continue;
      const hit = terms.some((t) => {
        if (Object.keys(t).length === 0) return true;
        if ("department" in t) return s.department === t.department;
        if ("businessUnitId" in t) return s.businessUnitId === t.businessUnitId;
        if ("employmentType" in t) return s.employmentType === t.employmentType;
        if ("reportsToId" in t) return s.reportsToId === t.reportsToId;
        if ("startDate" in t) {
          const r = t.startDate as { gt?: Date; lte?: Date };
          if (!s.startDate) return false;
          const v = s.startDate.getTime();
          return (!r.gt || v > r.gt.getTime()) && (!r.lte || v <= r.lte.getTime());
        }
        return false;
      });
      if (hit) out.add(id);
    }
    return out;
  }

  const ruleSets: AudienceRule[][] = [
    [{ kind: "ALL_ACTIVE", value: null }],
    [{ kind: "DEPARTMENT", value: "Consulting" }],
    [{ kind: "DEPARTMENT", value: "Finance" }],
    [{ kind: "BUSINESS_UNIT", value: "bu-1" }],
    [{ kind: "EMPLOYMENT_TYPE", value: "PART_TIME" }],
    [{ kind: "TENURE_BAND", value: "BAND_2_4Y" }],
    [{ kind: "TENURE_BAND", value: "BAND_7_10Y" }],
    [{ kind: "REPORTS_TO", value: "mgr-1" }],
    [{ kind: "DEPARTMENT", value: "Finance" }, { kind: "TENURE_BAND", value: "BAND_7_10Y" }],
    [{ kind: "DEPARTMENT", value: "Consulting" }, { kind: "EMPLOYMENT_TYPE", value: "PART_TIME" }],
  ];

  for (const rules of ruleSets) {
    const label = rules.map((r) => `${r.kind}:${r.value ?? "-"}`).join(" OR ");
    test(`where-clause and predicate select the same people — ${label}`, () => {
      const bySql = selectByWhere(rules);
      const byPredicate = new Set(
        population.filter(({ s }) => subjectMatchesAudience(s, rules, NOW)).map(({ id }) => id)
      );
      assert.deepEqual([...byPredicate].sort(), [...bySql].sort());
    });
  }
});
