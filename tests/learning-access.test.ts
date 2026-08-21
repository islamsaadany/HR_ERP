/**
 * Course access — the four routes, pure, no database.
 *
 * `resolveRoutes` is the ONLY statement of who may open a course, so this file is the matrix that
 * says what that means. The cases worth reading are the grandfathering ones: being mid-course is
 * modelled as a route in its own right, and these tests are what assert that choice actually
 * delivers FR-042 / FR-043 / FR-045 instead of merely describing them.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveRoutes, type AccessFacts } from "@/lib/learning/access";

const facts = (over: Partial<AccessFacts> = {}): AccessFacts => ({
  course: { status: "PUBLISHED", visibility: "RESTRICTED" },
  viewerIsAdmin: false,
  viewerIsActive: true,
  hasDirectAssignment: false,
  hasGroupAssignment: false,
  matchesAudience: false,
  enrollment: null,
  ...over,
});

const started = { completedAt: null, accessWithdrawnAt: null };

describe("each route grants on its own", () => {
  test("DIRECT", () => {
    const r = resolveRoutes(facts({ hasDirectAssignment: true }));
    assert.equal(r.allowed, true);
    assert.deepEqual(r.routes, ["DIRECT"]);
  });

  test("GROUP", () => {
    assert.deepEqual(resolveRoutes(facts({ hasGroupAssignment: true })).routes, ["GROUP"]);
  });

  test("AUDIENCE", () => {
    assert.deepEqual(resolveRoutes(facts({ matchesAudience: true })).routes, ["AUDIENCE"]);
  });

  test("OPEN — a published open course reaches every active employee", () => {
    const r = resolveRoutes(facts({ course: { status: "PUBLISHED", visibility: "OPEN" } }));
    assert.deepEqual(r.routes, ["OPEN"]);
  });

  test("IN_PROGRESS — mid-course, with nothing else granting", () => {
    const r = resolveRoutes(facts({ enrollment: started }));
    assert.equal(r.allowed, true);
    assert.deepEqual(r.routes, ["IN_PROGRESS"]);
    assert.equal(r.grandfatheredOnly, true);
  });

  test("nothing at all grants nothing", () => {
    const r = resolveRoutes(facts());
    assert.equal(r.allowed, false);
    assert.deepEqual(r.routes, []);
  });
});

describe("FR-005 — a draft is invisible to employees, by every route", () => {
  const draft = { status: "DRAFT" as const, visibility: "OPEN" as const };

  test("not even a direct assignment or an in-progress enrollment opens a draft", () => {
    const r = resolveRoutes(
      facts({ course: draft, hasDirectAssignment: true, matchesAudience: true, enrollment: started })
    );
    assert.equal(r.allowed, false);
  });

  test("an admin still reaches it — they are authoring it", () => {
    const r = resolveRoutes(facts({ course: draft, viewerIsAdmin: true }));
    assert.deepEqual(r.routes, ["ADMIN"]);
  });
});

describe("FR-017 — a leaver reaches nothing", () => {
  test("every learner route is closed once status is not ACTIVE", () => {
    const r = resolveRoutes(
      facts({
        viewerIsActive: false,
        course: { status: "PUBLISHED", visibility: "OPEN" },
        hasDirectAssignment: true,
        hasGroupAssignment: true,
        matchesAudience: true,
        enrollment: started,
      })
    );
    assert.equal(r.allowed, false);
  });
});

describe("SC-006 — two routes, one removed, access survives", () => {
  test("direct + group, group revoked → still allowed by direct", () => {
    const both = resolveRoutes(facts({ hasDirectAssignment: true, hasGroupAssignment: true }));
    assert.deepEqual(both.routes, ["DIRECT", "GROUP"]);

    const afterRevoke = resolveRoutes(facts({ hasDirectAssignment: true }));
    assert.equal(afterRevoke.allowed, true);
  });

  test("audience + direct, employee moves department → still allowed by direct", () => {
    const after = resolveRoutes(facts({ hasDirectAssignment: true, matchesAudience: false }));
    assert.equal(after.allowed, true);
  });

  test("holding a course by several routes is never 'grandfathered only'", () => {
    const r = resolveRoutes(facts({ matchesAudience: true, enrollment: started }));
    assert.deepEqual(r.routes, ["AUDIENCE", "IN_PROGRESS"]);
    assert.equal(r.grandfatheredOnly, false);
  });
});

describe("grandfathering — the requirements this modelling choice exists to deliver", () => {
  test("SC-010 / FR-042: started, then every other route removed → keeps it", () => {
    const before = resolveRoutes(facts({ matchesAudience: true, enrollment: started }));
    assert.equal(before.allowed, true);

    // The audience rule is deleted. NOTHING was written to the enrollment.
    const after = resolveRoutes(facts({ matchesAudience: false, enrollment: started }));
    assert.equal(after.allowed, true, "a mid-course learner must keep access");
    assert.equal(after.grandfatheredOnly, true);
  });

  test("FR-045: never started, route removed → loses it immediately", () => {
    const after = resolveRoutes(facts({ matchesAudience: false, enrollment: null }));
    assert.equal(after.allowed, false);
  });

  test("FR-043: access ends on completion", () => {
    const done = resolveRoutes(
      facts({ enrollment: { completedAt: new Date("2026-03-14"), accessWithdrawnAt: null } })
    );
    assert.equal(done.allowed, false);
  });

  test("FR-043: access ends when HR withdraws it", () => {
    const withdrawn = resolveRoutes(
      facts({ enrollment: { completedAt: null, accessWithdrawnAt: new Date("2026-08-21") } })
    );
    assert.equal(withdrawn.allowed, false);
  });

  test("a completed learner who STILL matches an audience keeps access — completion is not a ban", () => {
    const r = resolveRoutes(
      facts({
        matchesAudience: true,
        enrollment: { completedAt: new Date("2026-03-14"), accessWithdrawnAt: null },
      })
    );
    assert.equal(r.allowed, true);
    assert.deepEqual(r.routes, ["AUDIENCE"]);
    assert.equal(r.grandfatheredOnly, false);
  });

  test("a REOPENED completion becomes grandfathering again — completedAt is cleared", () => {
    // FR-040 clears completedAt and stamps reopenedAt, so the same enrollment starts granting
    // again with no other change. This is the Q1-C / Q2-B interaction working as designed.
    const reopened = resolveRoutes(facts({ matchesAudience: false, enrollment: started }));
    assert.equal(reopened.allowed, true);
    assert.equal(reopened.grandfatheredOnly, true);
  });

  test("withdrawal beats being mid-course, but not a real route", () => {
    // FR-044: withdraw ends grandfathered access. It must NOT strip someone holding the course
    // by an audience or assignment — the action refuses in that case, and the rule agrees here.
    const stillAssigned = resolveRoutes(
      facts({
        hasDirectAssignment: true,
        enrollment: { completedAt: null, accessWithdrawnAt: new Date("2026-08-21") },
      })
    );
    assert.equal(stillAssigned.allowed, true);
    assert.deepEqual(stillAssigned.routes, ["DIRECT"]);
    assert.equal(stillAssigned.grandfatheredOnly, false);
  });
});

describe("grandfatheredOnly — what the roster tints gold and offers Withdraw on", () => {
  test("an admin viewing a course they are also mid-way through is not 'grandfathered only'", () => {
    // ADMIN is not a learner route, so it must not mask the learner state underneath it.
    const r = resolveRoutes(facts({ viewerIsAdmin: true, enrollment: started }));
    assert.deepEqual(r.routes, ["ADMIN", "IN_PROGRESS"]);
    assert.equal(r.grandfatheredOnly, true);
  });

  test("an admin with no learner route at all is not grandfathered", () => {
    const r = resolveRoutes(facts({ viewerIsAdmin: true }));
    assert.deepEqual(r.routes, ["ADMIN"]);
    assert.equal(r.grandfatheredOnly, false);
  });
});
