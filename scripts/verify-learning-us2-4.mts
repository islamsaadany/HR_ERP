/** US2/US3/US4 against a real database: audiences, groups, withdrawal, the watch gate, the roster. */
import { PrismaClient } from "@prisma/client";
import { courseAccessFor, courseRoster, accessibleCoursesFor } from "../src/lib/learning/access.js";

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
await db.learnerGroupMember.deleteMany({});
await db.learnerGroup.deleteMany({});
await db.courseAudience.deleteMany({});
await db.videoCheckpoint.deleteMany({});
await db.lessonBlock.deleteMany({});
await db.lesson.deleteMany({});
await db.courseSection.deleteMany({});
await db.course.deleteMany({});
await db.user.deleteMany({ where: { email: { contains: "@u24.test" } } });

const YEAR = 365.25 * 24 * 3600 * 1000;
// Every user this script makes, so a roster assertion can be scoped to its own people. Other
// verification scripts leave their fixtures behind and several also use a "Consulting"
// department, so "the roster is exactly these two" was a claim about the whole database rather
// than about the rule, and it failed purely on which script ran first.
const mine = new Set<string>();
const mk = (id: string, over: Record<string, unknown> = {}) => {
  mine.add(id);
  return db.user.create({ data: { id, email: `${id}@u24.test`, name: id, status: "ACTIVE", ...over } });
};
const ours = (rows: { userId: string }[]) => rows.map(r => r.userId).filter(id => mine.has(id)).sort();

const cons1 = await mk("cons1", { department: "Consulting", startDate: new Date(Date.now() - 3 * YEAR) });
const cons2 = await mk("cons2", { department: "Consulting", startDate: new Date(Date.now() - 1 * YEAR) });
const fin = await mk("fin", { department: "Finance", startDate: new Date(Date.now() - 5 * YEAR) });
const nodept = await mk("nodept", { department: null, startDate: null });

const course = await db.course.create({
  data: {
    title: "Restricted course", status: "PUBLISHED", visibility: "RESTRICTED",
    sections: { create: { title: "S", order: 1, lessons: { create: [
      { title: "L1", order: 1, isRequired: true, minWatchPercent: 80 },
      { title: "L2", order: 2, isRequired: true },
    ] } } },
  },
  include: { sections: { include: { lessons: { orderBy: { order: "asc" } } } } },
});
const [l1, l2] = course.sections[0].lessons;
await db.lessonBlock.create({ data: { lessonId: l1.id, type: "VIDEO", order: 1, externalUrl: "https://vimeo.com/123", videoSource: "VIMEO" } });

// ── US2: audiences ──
check("no routes yet → nobody reaches it", (await courseRoster(course.id)).length, 0);
await db.courseAudience.create({ data: { courseId: course.id, kind: "DEPARTMENT", value: "Consulting" } });
check("Consulting audience reaches both consultants", ours(await courseRoster(course.id)), ["cons1", "cons2"]);
check("Finance is not reached", (await courseAccessFor(fin.id, course.id)).allowed, false);
check("employee with NO department is not reached and does not error", (await courseAccessFor(nodept.id, course.id)).allowed, false);

// SC-003: a brand-new joiner in Consulting is picked up with no HR action
const newbie = await mk("newbie", { department: "Consulting", startDate: new Date() });
check("SC-003: new Consulting hire holds it on first sign-in, no HR action", (await accessibleCoursesFor(newbie.id)).length, 1);

// ── US2: groups ──
const group = await db.learnerGroup.create({ data: { name: "2026 new joiners" } });
await db.courseAssignment.create({ data: { courseId: course.id, groupId: group.id } });
check("empty group adds nobody", (await courseAccessFor(fin.id, course.id)).allowed, false);
await db.learnerGroupMember.create({ data: { groupId: group.id, userId: fin.id } });
check("adding a member grants the group's course LIVE (no back-fill)", (await courseAccessFor(fin.id, course.id)).routes, ["GROUP"]);
await db.learnerGroupMember.deleteMany({ where: { groupId: group.id, userId: fin.id } });
check("removing them revokes it again", (await courseAccessFor(fin.id, course.id)).allowed, false);

// ── US2: two routes, one removed ──
await db.courseAssignment.create({ data: { courseId: course.id, userId: cons1.id } });
check("cons1 now holds it by TWO routes", (await courseAccessFor(cons1.id, course.id)).routes, ["DIRECT", "AUDIENCE"]);
await db.courseAudience.deleteMany({ where: { courseId: course.id } });
check("SC-006: audience removed → direct assignment still grants", (await courseAccessFor(cons1.id, course.id)).routes, ["DIRECT"]);
check("cons2 (audience only, never started) loses it immediately", (await courseAccessFor(cons2.id, course.id)).allowed, false);

// ── US3: the watch gate ──
const enr = await db.courseEnrollment.create({ data: { courseId: course.id, userId: cons1.id } });
const setWatch = (watched: number, duration: number) => db.$executeRaw`
  INSERT INTO "LessonProgress" ("id","enrollmentId","lessonId","lastPositionSec","videoWatchedSec","videoDurationSec","createdAt","updatedAt")
  VALUES (gen_random_uuid()::text, ${enr.id}, ${l1.id}, 0, ${watched}, NULLIF(${duration},0), NOW(), NOW())
  ON CONFLICT ("enrollmentId","lessonId") DO UPDATE SET
    "videoWatchedSec" = GREATEST("LessonProgress"."videoWatchedSec", ${watched}),
    "videoDurationSec" = GREATEST(COALESCE("LessonProgress"."videoDurationSec",0), ${duration})`;

const gateOpen = async () => {
  const p = await db.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enr.id, lessonId: l1.id } }, select: { videoWatchedSec: true, videoDurationSec: true } });
  const watched = p?.videoWatchedSec ?? 0, duration = p?.videoDurationSec ?? 0;
  return duration > 0 && watched >= Math.ceil((duration * 80) / 100);
};
check("SC-005: nothing watched → gate CLOSED", await gateOpen(), false);
await setWatch(50, 600);
check("50s of a 600s video (8%) → still closed", await gateOpen(), false);
await setWatch(500, 600);
check("500s of 600s (83%) → gate OPEN", await gateOpen(), true);
await setWatch(10, 600);
check("rewinding cannot re-close the gate", await gateOpen(), true);
await setWatch(500, 0);
const dur = await db.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enr.id, lessonId: l1.id } }, select: { videoDurationSec: true } });
check("a 0-duration tick cannot wipe a real duration", dur?.videoDurationSec, 600);

// ── US4: roster + grandfathering + withdraw ──
await db.courseAssignment.updateMany({ where: { courseId: course.id, userId: cons1.id }, data: { revokedAt: new Date() } });
const acc = await courseAccessFor(cons1.id, course.id);
check("last route revoked mid-course → grandfathered", acc.routes, ["IN_PROGRESS"]);
check("...and flagged grandfathered-only for the roster", acc.grandfatheredOnly, true);
const roster = await courseRoster(course.id);
check("roster still lists them", ours(roster), ["cons1"]);
await db.courseEnrollment.update({ where: { id: enr.id }, data: { accessWithdrawnAt: new Date() } });
check("FR-044: withdraw ends it", (await courseAccessFor(cons1.id, course.id)).allowed, false);
check("roster is now empty", (await courseRoster(course.id)).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
