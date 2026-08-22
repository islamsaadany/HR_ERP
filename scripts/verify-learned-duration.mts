import { PrismaClient } from "@prisma/client";
import { lessonLength } from "../src/lib/learning/renewal.js";
const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const lesson = await db.lesson.findFirst({ select: { id: true } });
if (!lesson) { console.log("no fixture"); process.exit(0); }
await db.lesson.update({ where: { id: lesson.id }, data: { videoDurationSec: null, estimatedMinutes: null } });

const teach = (d: number) => db.$executeRaw`
  UPDATE "Lesson" SET "videoDurationSec" = GREATEST(COALESCE("videoDurationSec", 0), ${d}) WHERE "id" = ${lesson.id}`;
const read = async () => (await db.lesson.findUnique({ where: { id: lesson.id }, select: { videoDurationSec: true } }))?.videoDurationSec;

check("unknown before anyone watches", await read(), null);
await teach(126);
check("first playback teaches it", await read(), 126);
await teach(0);
check("a 0 report cannot erase it", await read(), 126);
await teach(130);
check("a longer report wins", await read(), 130);

check("displayed as rounded-up minutes, marked as measured", lessonLength(null, 130), { minutes: 3, learned: true });
check("an author's estimate still wins", lessonLength(5, 130), { minutes: 5, learned: false });
check("no video, no estimate → no length invented", lessonLength(null, null), null);
check("a 90s video reads as 2 min, not 1", lessonLength(null, 90), { minutes: 2, learned: true });
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect(); process.exit(fail ? 1 : 0);
