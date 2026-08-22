/**
 * Course materials end-to-end against a real database (spec 038 materials, 2026-08-22).
 *
 * What this proves, and why each one is here rather than assumed:
 *   • only the SLIDES slot is employee-visible, and the rule has exactly one source;
 *   • a suggestion lands PENDING and is invisible to employees until HR approves it;
 *   • approving moves it into the course's list; declining takes it out of the queue for good;
 *   • one person is one rating — renewing UPDATES rather than adding, so an average cannot be
 *     skewed by somebody retaking a course;
 *   • the finish panel shows once per completion and asks again on a renewal.
 *
 * Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import {
  EMPLOYEE_VISIBLE_SLOTS,
  averageStars,
  isEmployeeVisibleSlot,
  isPreviewable,
  linkHost,
  normaliseResourceUrl,
  shouldAskForRating,
} from "../src/lib/learning/materials.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// ── clean slate ──
await db.courseRating.deleteMany({});
await db.courseResource.deleteMany({});
await db.courseDocument.deleteMany({});
await db.courseEnrollment.deleteMany({});
await db.course.deleteMany({});
await db.user.deleteMany({ where: { email: { endsWith: "@mat.test" } } });

const employee = await db.user.create({
  data: { email: "emp@mat.test", name: "Ahmed Ali", status: "ACTIVE" },
});
const other = await db.user.create({
  data: { email: "other@mat.test", name: "Mona Selim", status: "ACTIVE" },
});
const course = await db.course.create({
  data: { title: "Coaching Conversations", status: "PUBLISHED", visibility: "OPEN" },
});

// ── 1. which documents an employee may see ──
console.log("\n── documents ──");
check("the rule has one source and names one slot", [...EMPLOYEE_VISIBLE_SLOTS], ["SLIDES"]);
check("slides reach employees", isEmployeeVisibleSlot("SLIDES"), true);
check("the outline does not", isEmployeeVisibleSlot("OUTLINE"), false);
check("nor the expanded outline", isEmployeeVisibleSlot("EXPANDED_OUTLINE"), false);

for (const slot of ["OUTLINE", "EXPANDED_OUTLINE", "SLIDES"] as const) {
  await db.courseDocument.create({
    data: {
      courseId: course.id,
      slot,
      blobUrl: `https://blob.test/${slot}`,
      fileName: `${slot}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 1024,
    },
  });
}
const employeeSees = await db.courseDocument.findMany({
  where: { courseId: course.id, slot: { in: [...EMPLOYEE_VISIBLE_SLOTS] } },
  select: { slot: true },
});
check("the employee query returns only the slides", employeeSees.map((d) => d.slot), ["SLIDES"]);

// Replacing a slot must not produce two of it — the unique index, not a convention.
let duplicateRefused = false;
try {
  await db.courseDocument.create({
    data: { courseId: course.id, slot: "SLIDES", blobUrl: "https://blob.test/x", fileName: "x.pdf" },
  });
} catch {
  duplicateRefused = true;
}
check("a course cannot end up with two sets of slides", duplicateRefused, true);

check("a PDF previews", isPreviewable("application/pdf", "slides.pdf"), true);
check("a PDF by extension alone previews", isPreviewable(null, "slides.PDF"), true);
check("a PowerPoint does not (download only)", isPreviewable(null, "slides.pptx"), false);

// ── 2. suggestions ──
console.log("\n── suggestions ──");
const hrAdded = await db.courseResource.create({
  data: { courseId: course.id, kind: "BOOK", name: "The Coaching Habit", status: "PUBLISHED", order: 1 },
});
const suggested = await db.courseResource.create({
  data: {
    courseId: course.id,
    kind: "VIDEO",
    name: "The power of listening",
    url: "https://youtube.com/watch?v=x",
    status: "PENDING",
    suggestedById: employee.id,
  },
});

const visibleToEmployees = async () =>
  (await db.courseResource.findMany({
    where: { courseId: course.id, status: "PUBLISHED" },
    orderBy: { order: "asc" },
    select: { name: true },
  })).map((r) => r.name);

check("a suggestion is NOT in the library", await visibleToEmployees(), ["The Coaching Habit"]);
check(
  "it is in HR's queue",
  (await db.courseResource.findMany({ where: { status: "PENDING" }, select: { name: true } })).map((r) => r.name),
  ["The power of listening"]
);

await db.courseResource.update({
  where: { id: suggested.id },
  data: { status: "PUBLISHED", order: 2, reviewedById: other.id, reviewedAt: new Date() },
});
check("approving puts it in the library", await visibleToEmployees(), [
  "The Coaching Habit",
  "The power of listening",
]);
check(
  "and takes it out of the queue",
  await db.courseResource.count({ where: { status: "PENDING" } }),
  0
);

const declined = await db.courseResource.create({
  data: { courseId: course.id, kind: "LINK", name: "Something off-topic", status: "PENDING", suggestedById: employee.id },
});
await db.courseResource.update({ where: { id: declined.id }, data: { status: "DECLINED" } });
check("a declined suggestion never reaches employees", await visibleToEmployees(), [
  "The Coaching Habit",
  "The power of listening",
]);
check("nor returns to the queue", await db.courseResource.count({ where: { status: "PENDING" } }), 0);

check("who suggested it is kept", (await db.courseResource.findUnique({ where: { id: suggested.id }, select: { suggestedById: true } }))?.suggestedById, employee.id);
check("an HR-added resource has no suggester", (await db.courseResource.findUnique({ where: { id: hrAdded.id }, select: { suggestedById: true } }))?.suggestedById, null);

// ── 3. link handling ──
console.log("\n── links ──");
check("a bare host gets https", normaliseResourceUrl("hbr.org/2016/x"), "https://hbr.org/2016/x");
check("a full URL is kept", normaliseResourceUrl("https://a.com/b"), "https://a.com/b");
check("empty means no link", normaliseResourceUrl("  "), null);
check("a javascript: 'link' is refused", normaliseResourceUrl("javascript:alert(1)"), null);
check("a bare word is not an address", normaliseResourceUrl("coaching"), null);
check("the host is what a row shows", linkHost("https://www.hbr.org/x"), "hbr.org");

// ── 4. ratings ──
console.log("\n── ratings ──");
const enrollment = await db.courseEnrollment.create({
  data: { courseId: course.id, userId: employee.id, completedAt: new Date(), completionCount: 1 },
});
await db.courseEnrollment.create({
  data: { courseId: course.id, userId: other.id, completedAt: new Date(), completionCount: 1 },
});

await db.courseRating.create({ data: { courseId: course.id, userId: employee.id, stars: 4, completionIndex: 1 } });
await db.courseRating.create({ data: { courseId: course.id, userId: other.id, stars: 5, completionIndex: 1 } });

const stars = async () =>
  (await db.courseRating.findMany({ where: { courseId: course.id }, select: { stars: true } })).map((r) => r.stars);
check("two people, two scores", (await stars()).sort(), [4, 5]);
check("the average HR sees", averageStars(await stars()), 4.5);
check("no ratings reads as 'none', never 0", averageStars([]), null);

// A renewal re-rates: upsert, so the same person can never be counted twice.
await db.courseRating.upsert({
  where: { courseId_userId: { courseId: course.id, userId: employee.id } },
  create: { courseId: course.id, userId: employee.id, stars: 2, completionIndex: 2 },
  update: { stars: 2, completionIndex: 2 },
});
check("re-rating on renewal replaces, not adds", (await stars()).sort(), [2, 5]);
check("the average follows", averageStars(await stars()), 3.5);
check("still two rows, two people", await db.courseRating.count({ where: { courseId: course.id } }), 2);

// ── 5. the finish panel ──
console.log("\n── finish panel ──");
const ask = (completedAt: Date | null, completionCount: number, done: number) =>
  shouldAskForRating({ completedAt, completionCount, ratingPromptDoneCount: done });
check("not asked mid-course", ask(null, 0, 0), false);
check("asked on finishing", ask(new Date(), 1, 0), true);
check("not asked again after answering", ask(new Date(), 1, 1), false);
check("not asked again after skipping", ask(new Date(), 1, 1), false);
check("asked again after a renewal completion", ask(new Date(), 2, 1), true);

await db.courseEnrollment.update({
  where: { id: enrollment.id },
  data: { ratingPromptDoneCount: 1 },
});
const stored = await db.courseEnrollment.findUnique({
  where: { id: enrollment.id },
  select: { completedAt: true, completionCount: true, ratingPromptDoneCount: true },
});
check("skipping is durable across a page load", stored ? shouldAskForRating(stored) : null, false);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
