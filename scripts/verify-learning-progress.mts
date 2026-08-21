import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const uid = "u-verify-1";
const cid = "c-verify-1";

await db.$executeRaw`DELETE FROM "LessonProgress" WHERE "enrollmentId" IN (SELECT id FROM "CourseEnrollment" WHERE "userId" = ${uid})`;
await db.courseEnrollment.deleteMany({ where: { userId: uid } });
await db.course.deleteMany({ where: { id: cid } });
await db.user.deleteMany({ where: { id: uid } });

await db.user.create({ data: { id: uid, email: "verify@x.test", name: "Verify Person", status: "ACTIVE" } });
const course = await db.course.create({
  data: { id: cid, title: "Verify", status: "PUBLISHED", visibility: "OPEN",
    sections: { create: { title: "S1", order: 1, lessons: { create: [
      { title: "L1", order: 1, isRequired: true, minWatchPercent: 80 },
      { title: "L2", order: 2, isRequired: true },
      { title: "L3", order: 3, isRequired: false },
    ] } } } },
  include: { sections: { include: { lessons: { orderBy: { order: "asc" } } } } },
});
const lessons = course.sections[0].lessons;
const enr = await db.courseEnrollment.create({ data: { courseId: cid, userId: uid } });

const upsert = (lessonId: string, pos: number, watched: number) => db.$executeRaw`
  INSERT INTO "LessonProgress" ("id", "enrollmentId", "lessonId", "lastPositionSec", "videoWatchedSec", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, ${enr.id}, ${lessonId}, ${pos}, ${watched}, NOW(), NOW())
  ON CONFLICT ("enrollmentId", "lessonId") DO UPDATE
    SET "lastPositionSec" = ${pos},
        "videoWatchedSec" = GREATEST("LessonProgress"."videoWatchedSec", ${watched}),
        "updatedAt" = NOW()`;

const read = async (lessonId: string) =>
  db.lessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enr.id, lessonId } },
    select: { videoWatchedSec: true, lastPositionSec: true },
  });

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

await upsert(lessons[0].id, 100, 100);
check("insert path creates the row", (await read(lessons[0].id))?.videoWatchedSec, 100);

await upsert(lessons[0].id, 20, 20);
check("REWINDING does not reduce credited time (FR-028)", (await read(lessons[0].id))?.videoWatchedSec, 100);
check("...but the resume position DOES follow the playhead", (await read(lessons[0].id))?.lastPositionSec, 20);

await upsert(lessons[0].id, 150, 150);
check("watching further increases it", (await read(lessons[0].id))?.videoWatchedSec, 150);

// The two-tab race: concurrent writes, the lower one landing last.
await Promise.all([upsert(lessons[0].id, 400, 400), upsert(lessons[0].id, 200, 200)]);
check("two concurrent tabs keep the HIGHER figure", (await read(lessons[0].id))?.videoWatchedSec, 400);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
