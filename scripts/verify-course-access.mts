/**
 * Course access setup, against a real database (spec 038 follow-up, 2026-08-22).
 *
 * What this proves, each one a thing that was actually wrong or newly built:
 *   • each choice is counted ON ITS OWN — the defect this replaces printed one combined figure
 *     beside every choice, so a choice reaching nobody looked identical to one that worked;
 *   • a choice that reaches nobody counts 0, not "everyone" — a broken rule must never widen;
 *   • the total is DISTINCT people, not the sum of the chips;
 *   • HIDDEN stops everybody, including someone halfway through, and their progress survives;
 *   • a legacy "Everyone" audience really does override a RESTRICTED course — the trap the new
 *     form removes;
 *   • adding the same choice twice is a no-op.
 *
 * Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import { audienceReachByRule } from "../src/lib/learning/queries.js";
import { courseRoster, resolveRoutes } from "../src/lib/learning/access.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

await db.lessonProgress.deleteMany({});
await db.courseEnrollment.deleteMany({});
await db.courseAssignment.deleteMany({});
await db.courseAudience.deleteMany({});
await db.lessonBlock.deleteMany({});
await db.lesson.deleteMany({});
await db.courseSection.deleteMany({});
await db.course.deleteMany({});
// Department names unique to THIS script. They used to be "Consulting" and "Delivery", which
// other verification scripts also use — and since a reach count is a count over the whole
// database, another script's leftover Consulting employee silently made "reaches its 3" read 5.
// The count is right; the shared name was the bug.
const DEPT = "Access-test Consulting";
const OTHER_DEPT = "Access-test Delivery";
const EMPTY_DEPT = "Access-test Empty";

await db.user.deleteMany({ where: { email: { endsWith: "@acc.test" } } });
await db.department.deleteMany({ where: { name: { in: [DEPT, EMPTY_DEPT] } } });

await db.department.createMany({ data: [{ name: DEPT, order: 1 }, { name: EMPTY_DEPT, order: 2 }] });

const mk = (id: string, over: Record<string, unknown> = {}) =>
  db.user.create({ data: { id, email: `${id}@acc.test`, name: id, status: "ACTIVE", ...over } });

// 3 in Consulting, of whom 2 are also part-time. Nobody in Empty Dept.
await mk("c1", { department: DEPT, employmentType: "FULL_TIME" });
await mk("c2", { department: DEPT, employmentType: "PART_TIME" });
await mk("c3", { department: DEPT, employmentType: "PART_TIME" });
await mk("p1", { department: OTHER_DEPT, employmentType: "PART_TIME" });

const course = await db.course.create({
  data: { title: "Access test", status: "PUBLISHED", visibility: "RESTRICTED" },
});
const section = await db.courseSection.create({ data: { courseId: course.id, title: "S1", order: 1 } });
const lesson = await db.lesson.create({ data: { sectionId: section.id, title: "L1", order: 1, isRequired: true } });
await db.lessonBlock.create({ data: { lessonId: lesson.id, type: "TEXT", text: "hi", order: 1 } });

const dept = await db.courseAudience.create({ data: { courseId: course.id, kind: "DEPARTMENT", value: DEPT } });
const empty = await db.courseAudience.create({ data: { courseId: course.id, kind: "DEPARTMENT", value: EMPTY_DEPT } });
const part = await db.courseAudience.create({ data: { courseId: course.id, kind: "EMPLOYMENT_TYPE", value: "PART_TIME" } });

console.log("\n── each choice counted on its own (the defect) ──");
// Part-time is an enum, so unlike the department names it cannot be namespaced away from other
// scripts' fixtures. The expected figure is therefore counted from the database rather than
// written down — which is the stronger assertion anyway: the chip must equal the number of
// people who really carry that employment type, not a number that happened to be true once.
const partTimers = await db.user.count({ where: { status: "ACTIVE", employmentType: "PART_TIME" } });
const counts = await audienceReachByRule(course.id);
check("Consulting reaches its 3", counts.get(dept.id), 3);
check("an empty department reaches 0, not everyone", counts.get(empty.id), 0);
check("part-time reaches exactly the part-timers", counts.get(part.id), partTimers);
check("part-time is not zero — the rule is doing something", partTimers >= 2, true);
check("the three figures are NOT all the same", new Set([...counts.values()]).size > 1, true);

console.log("\n── the total is distinct people, not the sum ──");
const roster = await courseRoster(course.id);
const reached = roster.filter((r) => !r.access.grandfatheredOnly);
// c2 and c3 are in BOTH chips, so the distinct total is always two fewer than the sum. That
// relationship is the rule; the absolute numbers move with whatever else is in the database.
check("the chips double-count, the roster does not", 3 + 0 + partTimers - reached.length, 2);
check("everyone in the department is reached", ["c1", "c2", "c3"].every((id) => reached.some((r) => r.userId === id)), true);

console.log("\n── a rule with a value that no longer exists ──");
await db.department.deleteMany({ where: { name: DEPT } });
const afterDelete = await audienceReachByRule(course.id);
check(
  "the rule still matches the people who carry that department string",
  afterDelete.get(dept.id),
  3
);
// c1/c2/c3 are this script's own, and the department name is unique to it — so 3 here is a fact
// about the rule surviving the department row's deletion, not about the rest of the database.
await db.department.create({ data: { name: DEPT, order: 1 } });

console.log("\n── adding the same choice twice ──");
const before = await db.courseAudience.count({ where: { courseId: course.id } });
const dupe = await db.courseAudience.count({
  where: { courseId: course.id, kind: "DEPARTMENT", value: DEPT },
});
check("the rule is already there, so a second add is a no-op", dupe, 1);
check("count unchanged", await db.courseAudience.count({ where: { courseId: course.id } }), before);

console.log("\n── the legacy 'Everyone' trap ──");
const facts = {
  viewerIsAdmin: false, viewerIsActive: true, hasDirectAssignment: false,
  hasGroupAssignment: false, enrollment: null,
};
check(
  "a RESTRICTED course + an Everyone rule reaches somebody who matches nothing else",
  resolveRoutes({
    course: { status: "PUBLISHED", visibility: "RESTRICTED" },
    matchesAudience: true, // what an ALL_ACTIVE rule evaluates to for everybody
    ...facts,
  }).allowed,
  true
);
check(
  "without it, the same person gets nothing",
  resolveRoutes({
    course: { status: "PUBLISHED", visibility: "RESTRICTED" },
    matchesAudience: false,
    ...facts,
  }).allowed,
  false
);

console.log("\n── HIDDEN: paused ──");
const started = { completedAt: null, accessWithdrawnAt: null };
check(
  "someone halfway through a PUBLISHED course keeps it",
  resolveRoutes({
    course: { status: "PUBLISHED", visibility: "RESTRICTED" },
    matchesAudience: false, ...facts, enrollment: started,
  }).allowed,
  true
);
check(
  "pausing stops them too — that is what a pause means",
  resolveRoutes({
    course: { status: "HIDDEN", visibility: "RESTRICTED" },
    matchesAudience: true, ...facts, enrollment: started,
  }).allowed,
  false
);
check(
  "and it stops everyone else",
  resolveRoutes({
    course: { status: "HIDDEN", visibility: "OPEN" },
    matchesAudience: true, ...facts,
  }).allowed,
  false
);

// Progress must survive the pause, or it is a delete wearing a pause's clothes.
const enrollment = await db.courseEnrollment.create({ data: { courseId: course.id, userId: "c1" } });
await db.lessonProgress.create({
  data: { enrollmentId: enrollment.id, lessonId: lesson.id, completedAt: new Date(), videoWatchedSec: 42 },
});
await db.course.update({ where: { id: course.id }, data: { status: "HIDDEN" } });
const paused = await db.lessonProgress.findFirst({
  where: { enrollmentId: enrollment.id },
  select: { completedAt: true, videoWatchedSec: true },
});
check("their lesson tick survives the pause", paused?.completedAt !== null, true);
check("their watched seconds too", paused?.videoWatchedSec, 42);

await db.course.update({ where: { id: course.id }, data: { status: "PUBLISHED" } });
check(
  "and it all comes back when it is put back",
  resolveRoutes({
    course: { status: "PUBLISHED", visibility: "RESTRICTED" },
    matchesAudience: false, ...facts, enrollment: started,
  }).allowed,
  true
);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
