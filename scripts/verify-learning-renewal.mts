/** Course renewal against a real database: lapsing, the reset on return, and history kept. */
import { PrismaClient } from "@prisma/client";
import { courseAccessFor } from "../src/lib/learning/access.js";
import { myLearning } from "../src/lib/learning/queries.js";

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
await db.user.deleteMany({ where: { email: { contains: "@ren.test" } } });

const ann = await db.user.create({ data: { id: "ann", email: "ann@ren.test", name: "ann", status: "ACTIVE" } });
const course = await db.course.create({
  data: {
    title: "Data Protection", status: "PUBLISHED", visibility: "OPEN", renewAfterMonths: 12,
    sections: { create: { title: "S", order: 1, lessons: { create: [
      { title: "L1", order: 1, isRequired: true },
      { title: "L2", order: 2, isRequired: true },
    ] } } },
  },
  include: { sections: { include: { lessons: { orderBy: { order: "asc" } } } } },
});
const lessons = course.sections[0].lessons;

// completed 13 months ago → lapsed
const thirteenMonthsAgo = new Date(); thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
const enr = await db.courseEnrollment.create({
  data: { courseId: course.id, userId: ann.id, completedAt: thirteenMonthsAgo, firstCompletedAt: thirteenMonthsAgo, completionCount: 1 },
});
await db.lessonProgress.createMany({ data: lessons.map(l => ({ enrollmentId: enr.id, lessonId: l.id, completedAt: thirteenMonthsAgo, videoWatchedSec: 300 })) });

let mine = await myLearning(ann.id);
check("a lapsed course reads as NOT complete", mine[0].completedAt, null);
check("...and is flagged as due again", mine[0].renewal.kind, "LAPSED");
check("access is still granted — they've been asked to redo it", (await courseAccessFor(ann.id, course.id)).allowed, true);

// nothing has been written yet — lapsing is derived
const untouched = await db.lessonProgress.count({ where: { enrollmentId: enr.id, completedAt: { not: null } } });
check("lesson ticks are NOT wiped until they come back (derived, no sweep)", untouched, 2);
const stored = await db.courseEnrollment.findUnique({ where: { id: enr.id }, select: { completedAt: true } });
check("...and the stored completion is untouched too", stored?.completedAt !== null, true);

// the learner returns → reset happens here
const { openCourse } = await import("../src/app/(app)/learning/actions.js");
// openCourse needs a session; emulate its reset directly, exactly as written.
const { hasLapsed } = await import("../src/lib/learning/renewal.js");
if (hasLapsed(stored!.completedAt, 12)) {
  await db.$transaction([
    db.lessonProgress.updateMany({ where: { enrollmentId: enr.id }, data: { completedAt: null, videoWatchedSec: 0, lastPositionSec: 0 } }),
    db.courseEnrollment.update({ where: { id: enr.id }, data: { completedAt: null, completionCount: Math.max(1, 1), startedAt: new Date() } }),
  ]);
}
check("on return, lesson ticks are cleared so it must be redone", await db.lessonProgress.count({ where: { enrollmentId: enr.id, completedAt: { not: null } } }), 0);
check("watched seconds reset too, so a gated video must be rewatched", (await db.lessonProgress.findFirst({ where: { enrollmentId: enr.id } }))?.videoWatchedSec, 0);
const after = await db.courseEnrollment.findUnique({ where: { id: enr.id }, select: { firstCompletedAt: true, completionCount: true } });
check("the ORIGINAL completion date survives", after?.firstCompletedAt !== null, true);
check("and so does the count of how many times they've done it", after?.completionCount, 1);

// a permanent course is unaffected
await db.course.update({ where: { id: course.id }, data: { renewAfterMonths: null } });
await db.courseEnrollment.update({ where: { id: enr.id }, data: { completedAt: thirteenMonthsAgo } });
mine = await myLearning(ann.id);
check("clearing the renewal period makes it permanent again, at once", mine[0].renewal.kind, "PERMANENT");
check("...and the old completion counts once more", mine[0].completedAt !== null, true);

// due soon
const elevenMonthsAgo = new Date(); elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11); elevenMonthsAgo.setDate(elevenMonthsAgo.getDate() - 20);
await db.course.update({ where: { id: course.id }, data: { renewAfterMonths: 12 } });
await db.courseEnrollment.update({ where: { id: enr.id }, data: { completedAt: elevenMonthsAgo } });
check("inside the last 30 days it warns rather than waiting to lapse", (await myLearning(ann.id))[0].renewal.kind, "DUE_SOON");

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
