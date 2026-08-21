/** The manager team view: scope, live reporting lines, and what a manager must NOT see. */
import { PrismaClient } from "@prisma/client";
import { teamLearning } from "../src/lib/learning/queries.js";
import { isManager } from "../src/lib/roles.js";

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
await db.user.deleteMany({ where: { email: { contains: "@team.test" } } });

const mk = (id: string, over: Record<string, unknown> = {}) =>
  db.user.create({ data: { id, email: `${id}@team.test`, name: id, status: "ACTIVE", ...over } });

const boss = await mk("boss", { department: "Consulting" });
const rep1 = await mk("rep1", { department: "Consulting", reportsToId: "boss", title: "Consultant" });
const rep2 = await mk("rep2", { department: "Consulting", reportsToId: "boss" });
const other = await mk("other", { department: "Finance" });
const grandchild = await mk("grandchild", { reportsToId: "rep1" });

const course = await db.course.create({
  data: {
    title: "Team course", status: "PUBLISHED", visibility: "OPEN",
    sections: { create: { title: "S", order: 1, lessons: { create: [
      { title: "L1", order: 1, isRequired: true },
      { title: "L2", order: 2, isRequired: true },
    ] } } },
  },
  include: { sections: { include: { lessons: { orderBy: { order: "asc" } } } } },
});
const [l1] = course.sections[0].lessons;

check("boss is recognised as a manager", await isManager(boss.id), true);
check("a non-manager is not", await isManager(other.id), false);

let team = await teamLearning(boss.id);
check("sees exactly their DIRECT reports", team.map(t => t.userId).sort(), ["rep1", "rep2"]);
check("does NOT see reports-of-reports", team.some(t => t.userId === "grandchild"), false);
check("does NOT see people outside their line", team.some(t => t.userId === "other"), false);
check("each report shows the course they hold", team[0].courses.map(c => c.title), ["Team course"]);
check("nobody has finished yet", team[0].outstanding, 1);

// rep1 completes it
const enr = await db.courseEnrollment.create({ data: { courseId: course.id, userId: rep1.id } });
await db.lessonProgress.createMany({ data: course.sections[0].lessons.map(l => ({ enrollmentId: enr.id, lessonId: l.id, completedAt: new Date() })) });
await db.courseEnrollment.update({ where: { id: enr.id }, data: { completedAt: new Date("2026-08-20") } });
team = await teamLearning(boss.id);
const r1 = team.find(t => t.userId === "rep1")!;
check("a completed course shows 100%", r1.courses[0].percent, 100);
check("...and clears their outstanding count", r1.outstanding, 0);
check("the other report is still outstanding", team.find(t => t.userId === "rep2")!.outstanding, 1);

// reporting line moves — must take effect immediately, both directions
await db.user.update({ where: { id: rep2.id }, data: { reportsToId: other.id } });
team = await teamLearning(boss.id);
check("moving a report away removes them at once", team.map(t => t.userId), ["rep1"]);
check("the new manager picks them up at once", (await teamLearning(other.id)).map(t => t.userId), ["rep2"]);

// a leaver drops out
await db.user.update({ where: { id: rep1.id }, data: { status: "LEFT" } });
check("a leaver drops off the team view", (await teamLearning(boss.id)).length, 0);
check("...and the boss is no longer a manager", await isManager(boss.id), false);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
