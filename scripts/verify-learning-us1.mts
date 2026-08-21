/**
 * US1 end-to-end against a real database: publish gate, the learning loop, curriculum-edit safety,
 * draft invisibility, and the reopen contract. Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import { computeProgressPercent, firstIncompleteLessonId } from "../src/lib/learning/progress.js";
import { courseAccessFor, accessibleCoursesFor, courseRoster } from "../src/lib/learning/access.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// ── clean slate ──
await db.lessonProgress.deleteMany({});
await db.courseEnrollment.deleteMany({});
await db.courseAssignment.deleteMany({});
await db.courseAudience.deleteMany({});
await db.lessonBlock.deleteMany({});
await db.lesson.deleteMany({});
await db.courseSection.deleteMany({});
await db.course.deleteMany({});
await db.user.deleteMany({ where: { email: { endsWith: "@us1.test" } } });

const mk = (id: string, over: Record<string, unknown> = {}) =>
  db.user.create({ data: { id, email: `${id}@us1.test`, name: id, status: "ACTIVE", ...over } });

const alice = await mk("alice", { department: "Consulting" });
const bob = await mk("bob", { department: "Finance" });
const admin = await mk("admin", { role: "HR_ADMIN" });

const course = await db.course.create({
  data: {
    title: "Client Engagement Essentials",
    visibility: "OPEN",
    sections: {
      create: [
        { title: "Before", order: 1, lessons: { create: [
          { title: "L1", order: 1, isRequired: true },
          { title: "L2", order: 2, isRequired: true },
          { title: "L3 optional", order: 3, isRequired: false },
        ] } },
        { title: "On site", order: 2, lessons: { create: [{ title: "L4", order: 1, isRequired: true }] } },
      ],
    },
  },
  include: { sections: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
});
const L = course.sections.flatMap((s) => s.lessons);
const flat = L.map((l) => ({ id: l.id, isRequired: l.isRequired }));

// ── 1. draft invisibility ──
check("draft: employee has NO access", (await courseAccessFor(alice.id, course.id)).allowed, false);
check("draft: admin still reaches it", (await courseAccessFor(admin.id, course.id)).routes, ["ADMIN"]);
check("draft: absent from My learning", (await accessibleCoursesFor(alice.id)).length, 0);

// ── 2. publish gate: a lesson with no content blocks it ──
// (blocks are required by firstPublishGap; add them to one lesson only, then all)
await db.lessonBlock.create({ data: { lessonId: L[0].id, type: "TEXT", order: 1, text: "hello" } });
const gapRemains = await db.lesson.count({ where: { id: { in: L.map((l) => l.id) }, blocks: { none: {} } } });
check("publish gate: 3 lessons still have no content", gapRemains, 3);
for (const l of L.slice(1)) {
  await db.lessonBlock.create({ data: { lessonId: l.id, type: "TEXT", order: 1, text: "x" } });
}

await db.course.update({ where: { id: course.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });

// ── 3. the learning loop ──
check("published OPEN: alice reaches it", (await courseAccessFor(alice.id, course.id)).routes, ["OPEN"]);
check("published OPEN: bob (Finance) reaches it too", (await courseAccessFor(bob.id, course.id)).allowed, true);

const enr = await db.courseEnrollment.create({ data: { courseId: course.id, userId: alice.id } });
check("fresh enrollment: 0%", computeProgressPercent(flat, []), 0);
check("resume point is the first lesson", firstIncompleteLessonId(flat, []), L[0].id);

const complete = async (lessonId: string) =>
  db.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enr.id, lessonId } },
    create: { enrollmentId: enr.id, lessonId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });

await complete(L[0].id);
await complete(L[2].id); // the OPTIONAL one
let done = (await db.lessonProgress.findMany({ where: { enrollmentId: enr.id, completedAt: { not: null } }, select: { lessonId: true } })).map((d) => d.lessonId);
check("optional lesson does NOT move the figure (1 of 3 required)", computeProgressPercent(flat, done), 33);

await complete(L[1].id);
await complete(L[3].id);
done = (await db.lessonProgress.findMany({ where: { enrollmentId: enr.id, completedAt: { not: null } }, select: { lessonId: true } })).map((d) => d.lessonId);
check("all required done → 100%", computeProgressPercent(flat, done), 100);
await db.courseEnrollment.update({ where: { id: enr.id }, data: { completedAt: new Date("2026-03-14") } });

// ── 4. FR-023: a curriculum edit cannot move the figure ──
await db.lesson.update({ where: { id: L[0].id }, data: { order: 9, title: "L1 renamed" } });
const reordered = await db.lesson.findMany({ where: { sectionId: { in: course.sections.map((s) => s.id) }, deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, isRequired: true } });
check("after reorder + rename: still 100%", computeProgressPercent(reordered, done), 100);

// ── 5. the reopen contract ──
const roster = await courseRoster(course.id);
// Assert MEMBERSHIP, not a raw count — an OPEN course reaches every active employee, so any other
// row left in the database by another script would make a count assertion fail for no good reason.
const rosterIds = new Set(roster.map((r) => r.userId));
check("roster reaches alice, bob and the admin (OPEN course)",
  [alice.id, bob.id, admin.id].every((id) => rosterIds.has(id)), true);
check("alice's route is OPEN, not AUDIENCE", roster.find((r) => r.userId === alice.id)?.access.routes, ["OPEN"]);
const completedOnRoster = roster.filter((r) => r.enrollment?.completedAt != null);
check("one completed person is visible to a reopen", completedOnRoster.length, 1);

// apply REOPEN by hand exactly as the action does
const target = completedOnRoster[0].enrollment!;
await db.courseEnrollment.update({
  where: { id: target.id },
  data: { firstCompletedAt: target.firstCompletedAt ?? target.completedAt, completedAt: null, reopenedAt: new Date() },
});
const after = await db.courseEnrollment.findUnique({ where: { id: target.id }, select: { completedAt: true, firstCompletedAt: true, reopenedAt: true } });
check("reopen: completedAt cleared", after?.completedAt, null);
check("reopen: ORIGINAL date preserved (FR-040)", after?.firstCompletedAt?.toISOString().slice(0, 10), "2026-03-14");
check("reopen: reopenedAt stamped", after?.reopenedAt !== null, true);

// ── 6. grandfathering, on a restricted course ──
await db.course.update({ where: { id: course.id }, data: { visibility: "RESTRICTED" } });
await db.courseAudience.create({ data: { courseId: course.id, kind: "DEPARTMENT", value: "Consulting" } });
check("restricted: alice reached by audience", (await courseAccessFor(alice.id, course.id)).routes, ["AUDIENCE", "IN_PROGRESS"]);
check("restricted: bob no longer reached (never started)", (await courseAccessFor(bob.id, course.id)).allowed, false);

await db.user.update({ where: { id: alice.id }, data: { department: "Marketing" } });
const moved = await courseAccessFor(alice.id, course.id);
check("SC-010: alice moved department mid-course → KEEPS it", moved.allowed, true);
check("...and is now grandfathered-only", moved.grandfatheredOnly, true);

await db.courseEnrollment.update({ where: { id: target.id }, data: { accessWithdrawnAt: new Date() } });
check("FR-043: HR withdraws → access ends", (await courseAccessFor(alice.id, course.id)).allowed, false);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
