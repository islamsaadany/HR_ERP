/**
 * Proves the course-ordering write (2026-09-15) against a real Postgres.
 *
 *   POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx tsx scripts/verify-course-order.mts
 *
 * What is actually at stake is not the admin list — it is that the published order IS the order
 * every employee meets their courses in, so the last check drives the real employee reader rather
 * than re-querying the table the way the writer did.
 *
 * TWO THINGS KEEP IT HONEST IN A SHARED DATABASE. Every string it writes is namespaced to it
 * (`vco-` ids, its own email domain). And, less obviously, reordering is a WHOLE-STATE operation:
 * the write demands the submitted list account for every course in that state, so a script that
 * submitted only its own fixtures would pass alone and fail the moment another script left a
 * course behind. So it reads the real list out of the database and rearranges its own courses
 * inside it — which is also exactly what the screen does.
 */
import { PrismaClient } from "@prisma/client";
import type { LearningCourseStatus } from "@prisma/client";
import { accessibleCoursesFor } from "../src/lib/learning/access";
import {
  isCourseStatus,
  LIST_CHANGED,
  reorderCoursesWithin,
  statusRank,
  STATUS_ORDER,
} from "../src/lib/learning/order";

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const P = ["vco-pub-a", "vco-pub-b", "vco-pub-c"] as const;
const D = ["vco-draft-a", "vco-draft-b"] as const;
const H = ["vco-paused-a"] as const;
const OURS = [...P, ...D, ...H, "vco-late"];
const LEARNER = "vco-learner";
const mine = (ids: string[]) => ids.filter((id) => id.startsWith("vco-"));

/** The real stored order of one state, everybody's courses included. */
async function storedOrder(status: LearningCourseStatus) {
  const rows = await prisma.course.findMany({
    where: { status },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * The list the screen would submit for putting OUR courses in `wanted` order: the real list with
 * the slots our courses occupy refilled in the order we want, leaving anybody else's alone.
 */
async function submissionFor(status: LearningCourseStatus, wanted: string[]) {
  const full = await storedOrder(status);
  const slots = full.map((id, i) => (wanted.includes(id) ? i : -1)).filter((i) => i >= 0);
  const next = full.slice();
  slots.forEach((slot, i) => {
    next[slot] = wanted[i];
  });
  return next;
}

async function orderOf(ids: string[]) {
  const rows = await prisma.course.findMany({
    where: { id: { in: ids } },
    select: { id: true, order: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.order])) as Record<string, number>;
}

async function seed() {
  await prisma.course.deleteMany({ where: { id: { in: OURS } } });
  await prisma.user.deleteMany({ where: { id: LEARNER } });

  // Deliberately ALL ZERO: a course created before creation started assigning a number carries 0,
  // and several 0s tie — so the fixture is the legacy mess the canonical renumbering must repair.
  const make = (id: string, title: string, status: LearningCourseStatus) =>
    prisma.course.create({
      data: {
        id,
        title,
        status,
        visibility: "OPEN",
        order: 0,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });

  await make(P[0], "VCO Alpha", "PUBLISHED");
  await make(P[1], "VCO Bravo", "PUBLISHED");
  await make(P[2], "VCO Charlie", "PUBLISHED");
  await make(D[0], "VCO Delta", "DRAFT");
  await make(D[1], "VCO Echo", "DRAFT");
  await make(H[0], "VCO Foxtrot", "HIDDEN");

  await prisma.user.create({
    data: { id: LEARNER, email: "learner@vco-order.test", name: "VCO Learner" },
  });
}

async function main() {
  console.log("\nCourse ordering\n");

  console.log("The state sequence");
  check("published leads, then drafts, then paused", STATUS_ORDER.join(",") === "PUBLISHED,DRAFT,HIDDEN");
  check(
    "statusRank agrees",
    statusRank("PUBLISHED") < statusRank("DRAFT") && statusRank("DRAFT") < statusRank("HIDDEN")
  );
  check(
    "a state that is not one is refused",
    !isCourseStatus("published") && !isCourseStatus("NONSENSE") && isCourseStatus("HIDDEN")
  );

  await seed();

  console.log("\nArranging the published courses");
  const wanted = [P[2], P[0], P[1]];
  const first = await reorderCoursesWithin("PUBLISHED", await submissionFor("PUBLISHED", wanted));
  check("the write is accepted", first.ok, first.ok ? "" : first.error);
  check(
    "the published courses are in the order given",
    mine(await storedOrder("PUBLISHED")).join(",") === wanted.join(","),
    mine(await storedOrder("PUBLISHED")).join(",")
  );

  // Properties of the canonical renumbering, counted FROM the database so they hold however many
  // other courses happen to be in it.
  const all = await prisma.course.findMany({ select: { id: true, status: true, order: true } });
  const orders = all.map((c) => c.order).sort((a, b) => a - b);
  check(
    "every course has a distinct number, gap-free from 1 — the legacy ties repaired",
    orders.every((n, i) => n === i + 1),
    orders.join(",")
  );
  const worstPublished = Math.max(...all.filter((c) => c.status === "PUBLISHED").map((c) => c.order));
  const bestOther = Math.min(
    ...all.filter((c) => c.status !== "PUBLISHED").map((c) => c.order),
    Number.MAX_SAFE_INTEGER
  );
  check("every published course is numbered above every draft and paused one", worstPublished < bestOther);

  const drafts = mine(await storedOrder("DRAFT"));
  check("the other states kept their own order", drafts.join(",") === [D[0], D[1]].join(","), drafts.join(","));

  console.log("\nWhat the write refuses");
  const before = await orderOf(OURS);
  const unchanged = async (label: string) => {
    const now = await orderOf(OURS);
    check(label, Object.keys(before).every((id) => now[id] === before[id]), JSON.stringify(now));
  };
  const published = await storedOrder("PUBLISHED");

  const short = await reorderCoursesWithin("PUBLISHED", published.slice(1));
  check("a list missing a course is refused", !short.ok && short.error === LIST_CHANGED);
  await unchanged("…and nothing was written");

  const dupe = await reorderCoursesWithin("PUBLISHED", [published[0], ...published]);
  check("a list naming one course twice is refused", !dupe.ok);
  await unchanged("…and nothing was written");

  const crossed = await reorderCoursesWithin("PUBLISHED", [...published.slice(1), D[0]]);
  check("a course from another state cannot be dropped in", !crossed.ok);
  await unchanged("…and nothing was written");

  // The guard has to start from what it protects: a course that appeared since the page loaded is
  // absent from the submitted list and produces nothing to check, so a check written the other way
  // round would wave this through and leave the newcomer holding a stale number.
  await prisma.course.create({
    data: { id: "vco-late", title: "VCO Late", status: "PUBLISHED", visibility: "OPEN", order: 9999 },
  });
  const stale = await reorderCoursesWithin("PUBLISHED", published);
  check("a course published in another tab refuses the stale list", !stale.ok && stale.error === LIST_CHANGED);
  await unchanged("…and nothing was written");

  const withLate = await reorderCoursesWithin("PUBLISHED", [...published, "vco-late"]);
  check("and the same move including it is accepted", withLate.ok, withLate.ok ? "" : withLate.error);
  const now = await orderOf(OURS);
  check("a newly published course sits below the ones already arranged", now["vco-late"] > now[P[1]]);

  console.log("\nWhat the employee gets");
  const held = await accessibleCoursesFor(LEARNER);
  const seen = mine(held.map((c) => c.courseId));
  check(
    "the employee meets the published courses in the admin's order",
    seen.join(",") === [...wanted, "vco-late"].join(","),
    seen.join(",")
  );
  check("a draft and a paused course reach nobody", !seen.includes(D[0]) && !seen.includes(H[0]));

  await prisma.course.deleteMany({ where: { id: { in: OURS } } });
  await prisma.user.deleteMany({ where: { id: LEARNER } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
