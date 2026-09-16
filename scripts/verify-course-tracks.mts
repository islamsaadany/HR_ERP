/**
 * Proves Learning tracks (spec 043) against a real Postgres.
 *
 *   POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB AUTH_SECRET=anything \
 *     npx tsx scripts/verify-course-tracks.mts
 *
 * The load-bearing claim is that being on a track GRANTS its courses and that the grant is decided
 * in ONE place. So the first section drives all three entry points over the same person and course
 * and demands they agree — a disagreement there is the whole feature broken, and it is exactly the
 * kind of fault that no type check can see.
 *
 * Everything this script writes is namespaced to it (`vct-` ids, its own email domain, its own
 * track and department names). The verify scripts share one database, and a script that collides
 * with another's fixtures fails in a way that looks exactly like a real failure.
 */
import { PrismaClient } from "@prisma/client";
import { accessibleCoursesFor, courseAccessFor, courseRoster } from "../src/lib/learning/access";
import {
  addStep,
  assignTrack,
  createTrack,
  reorderSteps,
  revokeTrackAssignment,
  setStepDeadline,
} from "../src/lib/learning/tracks";
import { TRACK_CHANGED } from "../src/lib/learning/track-results";
import { deadlinesFor, overdueNow } from "../src/lib/learning/overdue";
import { REMINDER_SCHEDULE, isReminderDay } from "../src/lib/learning/deadlines";
import { getLearningSettings, setRemindersEnabled } from "../src/lib/learning/settings";

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Namespaced fixtures ────────────────────────────────────────────────
const U = { onTrack: "vct-u-track", inGroup: "vct-u-group", outside: "vct-u-outside", actor: "vct-u-actor" };
const C = { first: "vct-c-first", second: "vct-c-second", draft: "vct-c-draft", audience: "vct-c-aud" };
const G = "vct-group";
const IDS = [...Object.values(U), ...Object.values(C), G];

async function seed() {
  await prisma.learningTrack.deleteMany({ where: { name: { startsWith: "VCT " } } });
  await prisma.learningPersonalStep.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await prisma.courseEnrollment.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await prisma.learnerGroupMember.deleteMany({ where: { groupId: G } });
  await prisma.learnerGroup.deleteMany({ where: { id: G } });
  await prisma.course.deleteMany({ where: { id: { in: Object.values(C) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });

  for (const [key, id] of Object.entries(U)) {
    await prisma.user.create({
      data: { id, email: `${key}@vct-tracks.test`, name: `VCT ${key}`, status: "ACTIVE" },
    });
  }
  const course = (id: string, title: string, status: "DRAFT" | "PUBLISHED" | "HIDDEN") =>
    prisma.course.create({
      data: { id, title, status, visibility: "RESTRICTED", order: 0 },
    });
  await course(C.first, "VCT First", "PUBLISHED");
  await course(C.second, "VCT Second", "PUBLISHED");
  await course(C.draft, "VCT Draft", "DRAFT");
  await course(C.audience, "VCT Audience", "PUBLISHED");

  await prisma.learnerGroup.create({ data: { id: G, name: "VCT Group" } });
}

const routesFor = async (userId: string, courseId: string) =>
  (await courseAccessFor(userId, courseId)).routes;

const heldBy = async (userId: string) =>
  (await accessibleCoursesFor(userId)).map((c) => c.courseId).filter((id) => id.startsWith("vct-"));

async function main() {
  console.log("\nLearning tracks\n");
  await seed();

  // ── The fifth route ──────────────────────────────────────────────────
  console.log("A track grants its courses");
  const track = await createTrack("VCT Onboarding", "for the verify script", U.actor);
  check("the track is created", track.ok, track.ok ? "" : track.error);
  if (!track.ok) process.exit(1);
  const trackId = track.id!;

  check("a published course can be added", (await addStep(trackId, C.first)).ok);
  check("a second one too", (await addStep(trackId, C.second)).ok);

  const draftAdd = await addStep(trackId, C.draft);
  check("a DRAFT course is refused — a path of drafts would reach nobody", !draftAdd.ok);

  check("before assignment the person holds nothing", (await heldBy(U.onTrack)).length === 0);

  const assigned = await assignTrack(trackId, { userId: U.onTrack }, U.actor);
  check("the track is assigned to a person", assigned.ok, assigned.ok ? "" : assigned.error);

  const held = await heldBy(U.onTrack);
  check("they now hold both courses", held.length === 2 && held.includes(C.first), held.join(","));
  check("the route is reported as TRACK", (await routesFor(U.onTrack, C.first)).includes("TRACK"));

  // The one that matters most: three entry points, one answer.
  console.log("\nAll three entry points agree");
  const perCourse = (await courseAccessFor(U.onTrack, C.first)).allowed;
  const viaList = (await heldBy(U.onTrack)).includes(C.first);
  const roster = await courseRoster(C.first);
  const viaRoster = roster.some((r) => r.userId === U.onTrack);
  check("courseAccessFor says yes", perCourse);
  check("accessibleCoursesFor says yes", viaList);
  check("courseRoster lists them — the candidate union includes track holders", viaRoster);
  check("…and all three agree", perCourse === viaList && viaList === viaRoster);

  const outsider = await courseAccessFor(U.outside, C.first);
  check("somebody not on the track is refused", !outsider.allowed);
  check("and the roster does not list them", !roster.some((r) => r.userId === U.outside));

  // ── Groups ───────────────────────────────────────────────────────────
  console.log("\nA track handed to a group");
  const groupAssigned = await assignTrack(trackId, { groupId: G }, U.actor);
  check("the track is assigned to a group", groupAssigned.ok);
  check("somebody not yet in the group holds nothing", (await heldBy(U.inGroup)).length === 0);

  await prisma.learnerGroupMember.create({ data: { groupId: G, userId: U.inGroup } });
  check(
    "joining the group later brings the track with it, with nobody assigning anything",
    (await heldBy(U.inGroup)).length === 2
  );

  // ── Draft and paused reach nobody ────────────────────────────────────
  console.log("\nUnpublished work reaches nobody, track or no track");
  await prisma.learningTrackStep.create({
    data: { trackId, courseId: C.draft, order: 99 },
  });
  check("a draft course on a track is not held", !(await heldBy(U.onTrack)).includes(C.draft));
  check("and cannot be opened", !(await courseAccessFor(U.onTrack, C.draft)).allowed);

  await prisma.course.update({ where: { id: C.second }, data: { status: "HIDDEN" } });
  check("pausing a course removes it from the track holder", !(await heldBy(U.onTrack)).includes(C.second));
  await prisma.course.update({ where: { id: C.second }, data: { status: "PUBLISHED" } });
  check("and it returns when unpaused", (await heldBy(U.onTrack)).includes(C.second));

  // ── Revocation and grandfathering ────────────────────────────────────
  console.log("\nLosing a track");
  const assignmentRow = await prisma.learningTrackAssignment.findFirstOrThrow({
    where: { trackId, userId: U.onTrack },
    select: { id: true },
  });

  // Start one of them, leave the other untouched.
  await prisma.courseEnrollment.create({ data: { courseId: C.first, userId: U.onTrack } });
  await revokeTrackAssignment(assignmentRow.id);

  const afterRevoke = await heldBy(U.onTrack);
  check("the untouched course is gone", !afterRevoke.includes(C.second), afterRevoke.join(","));
  check("the STARTED course is kept — mid-course outlives the route that introduced it", afterRevoke.includes(C.first));
  const grandfathered = await courseAccessFor(U.onTrack, C.first);
  check("…and is reported as grandfathered only", grandfathered.grandfatheredOnly);

  // ── Two routes, losing one ───────────────────────────────────────────
  console.log("\nA course reached two ways");
  await prisma.courseAudience.create({
    data: { courseId: C.audience, kind: "ALL_ACTIVE", value: null },
  });
  await addStep(trackId, C.audience);
  const reAssigned = await assignTrack(trackId, { userId: U.onTrack }, U.actor);
  check("the track is re-assigned", reAssigned.ok);
  const both = await courseAccessFor(U.onTrack, C.audience);
  check("both routes are reported", both.routes.includes("TRACK") && both.routes.includes("AUDIENCE"), both.routes.join(","));

  await prisma.courseAudience.deleteMany({ where: { courseId: C.audience } });
  check("losing the audience rule leaves the track route standing", (await routesFor(U.onTrack, C.audience)).includes("TRACK"));

  // ── The reorder guard ────────────────────────────────────────────────
  console.log("\nArranging the steps");
  const steps = await prisma.learningTrackStep.findMany({
    where: { trackId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const ids = steps.map((s) => s.id);

  const reversed = [...ids].reverse();
  check("a complete list is accepted", (await reorderSteps(trackId, reversed)).ok);
  const afterOrder = await prisma.learningTrackStep.findMany({
    where: { trackId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  check("the steps are in the order given", afterOrder.map((s) => s.id).join() === reversed.join());
  check("numbering is gap-free from 1", afterOrder.every((s, i) => s.order === i + 1));

  const before = new Map(afterOrder.map((s) => [s.id, s.order]));
  const unchanged = async (label: string) => {
    const now = await prisma.learningTrackStep.findMany({
      where: { trackId },
      select: { id: true, order: true },
    });
    // Only the steps the snapshot knew about: a later check deliberately ADDS one, and a step
    // that did not exist when `before` was taken has nothing to be unchanged from.
    check(label, now.filter((s) => before.has(s.id)).every((s) => before.get(s.id) === s.order));
  };

  const short = await reorderSteps(trackId, reversed.slice(1));
  check("a list missing a step is refused", !short.ok && short.error === TRACK_CHANGED);
  await unchanged("…and nothing was written");

  const dupe = await reorderSteps(trackId, [reversed[0], ...reversed]);
  check("a list naming one step twice is refused", !dupe.ok);
  await unchanged("…and nothing was written");

  // A step added in another tab: the guard must start from what the DATABASE holds.
  await addStep(trackId, C.draft).catch(() => undefined);
  const late = await prisma.learningTrackStep.create({
    data: { trackId, courseId: C.first, order: 999 },
  }).catch(() => null);
  if (late === null) {
    const extraCourse = await prisma.course.create({
      data: { id: "vct-c-late", title: "VCT Late", status: "PUBLISHED", visibility: "RESTRICTED", order: 0 },
    });
    IDS.push(extraCourse.id);
    await addStep(trackId, extraCourse.id);
  }
  const stale = await reorderSteps(trackId, reversed);
  check("a step added since the page loaded refuses the stale list", !stale.ok && stale.error === TRACK_CHANGED);
  await unchanged("…and nothing was written");

  // ── Deadlines: the shape rule ────────────────────────────────────────
  console.log("\nA step carries one kind of deadline");
  const step = ids[0];
  check("a period is accepted", (await setStepDeadline(step, { dueDays: 30, dueOn: null })).ok);
  check("a fixed date is accepted", (await setStepDeadline(step, { dueDays: null, dueOn: new Date("2026-12-31") })).ok);
  check("both at once is refused", !(await setStepDeadline(step, { dueDays: 30, dueOn: new Date("2026-12-31") })).ok);
  check("zero days is refused", !(await setStepDeadline(step, { dueDays: 0, dueOn: null })).ok);

  let constraintHeld = false;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "LearningTrackStep" SET "dueDays" = 30, "dueOn" = '2026-12-31' WHERE id = $1`,
      step
    );
  } catch {
    constraintHeld = true;
  }
  check("and the database refuses it too, not only the action", constraintHeld);

  // ── Deadlines end to end ─────────────────────────────────────────────
  console.log("\nDeadlines, resolved against a real database");

  // Rebuild a clean track: one step due 10 days after joining, one due on a fixed past date.
  await prisma.learningTrack.deleteMany({ where: { name: { startsWith: "VCT " } } });
  await prisma.courseEnrollment.deleteMany({ where: { userId: { in: Object.values(U) } } });
  const dl = await createTrack("VCT Deadlines", null, U.actor);
  const dlId = (dl as { id: string }).id;
  await addStep(dlId, C.first);
  await addStep(dlId, C.second);

  const [stepA, stepB] = await prisma.learningTrackStep.findMany({
    where: { trackId: dlId },
    orderBy: { order: "asc" },
    select: { id: true, courseId: true },
  });
  await setStepDeadline(stepA.id, { dueDays: 10, dueOn: null });
  await setStepDeadline(stepB.id, { dueDays: null, dueOn: new Date("2026-01-31") });
  await assignTrack(dlId, { userId: U.onTrack }, U.actor);

  // Joined 40 days ago, so the 10-day step is 30 days overdue.
  const joined = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  await prisma.learningTrackAssignment.updateMany({
    where: { trackId: dlId, userId: U.onTrack },
    data: { assignedAt: joined },
  });

  const resolved = await deadlinesFor(U.onTrack);
  check("a period resolves from the day they joined", resolved.get(stepA.courseId)?.due !== null);
  check("a fixed date resolves to itself", resolved.get(stepB.courseId)?.due?.getUTCFullYear() === 2026);
  check("the track's name comes with it", resolved.get(stepA.courseId)?.trackName === "VCT Deadlines");

  const overdue = await overdueNow();
  const mine = overdue.filter((o) => o.userId === U.onTrack);
  check("both are overdue", mine.length === 2, `${mine.length}`);

  // Completing one removes it — with nothing written anywhere about overdue-ness.
  await prisma.courseEnrollment.create({
    data: { courseId: stepA.courseId, userId: U.onTrack, completedAt: new Date() },
  });
  const afterDone = (await overdueNow()).filter((o) => o.userId === U.onTrack);
  check(
    "completing a course stops it being overdue, with nothing written",
    afterDone.length === 1 && afterDone[0].courseId === stepB.courseId
  );

  // A course in two tracks: the earlier date governs, both resolved first.
  const second = await createTrack("VCT Second Path", null, U.actor);
  const secondId = (second as { id: string }).id;
  await addStep(secondId, stepB.courseId);
  const otherStep = await prisma.learningTrackStep.findFirstOrThrow({
    where: { trackId: secondId },
    select: { id: true },
  });
  await setStepDeadline(otherStep.id, { dueDays: null, dueOn: new Date("2030-12-31") });
  await assignTrack(secondId, { userId: U.onTrack }, U.actor);

  const twoPaths = await deadlinesFor(U.onTrack);
  check(
    "a course in two tracks takes the EARLIER date — adding work never pushes a date later",
    twoPaths.get(stepB.courseId)?.due?.getUTCFullYear() === 2026,
    String(twoPaths.get(stepB.courseId)?.due)
  );
  const listed = (await overdueNow()).filter((o) => o.courseId === stepB.courseId && o.userId === U.onTrack);
  check("and it is listed once, not twice", listed.length === 1, `${listed.length}`);

  // ── The bound ────────────────────────────────────────────────────────
  console.log("\nThe reminder bound");
  check("five messages and no more", REMINDER_SCHEDULE.length === 5);
  check(
    "only the scheduled days chase",
    REMINDER_SCHEDULE.every((d) => isReminderDay(d)) && ![1, 8, 29, 35].some((d) => isReminderDay(d))
  );

  // The bound must not be reachable from the database — a settings column would make it a
  // decision nobody made, which the constitution forbids.
  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'LearningSettings'`
  );
  const names = columns.map((c) => c.column_name.toLowerCase());
  check(
    "LearningSettings has NO cadence column — the bound cannot become configurable",
    !names.some((n) => /day|week|cadence|interval|schedule|count|max/.test(n)),
    names.join(",")
  );

  // Never twice on one day.
  const today = new Date();
  const todayOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await prisma.learningReminderLog.deleteMany({ where: { userId: U.onTrack } });
  await prisma.learningReminderLog.create({
    data: { userId: U.onTrack, courseId: stepB.courseId, sentOn: todayOnly },
  });
  let twiceRefused = false;
  try {
    await prisma.learningReminderLog.create({
      data: { userId: U.onTrack, courseId: stepB.courseId, sentOn: todayOnly },
    });
  } catch {
    twiceRefused = true;
  }
  check("the same reminder twice in one day is refused by the database", twiceRefused);

  // ── The switch ───────────────────────────────────────────────────────
  console.log("\nThe switch");
  // The DEFAULT, not the current value: the singleton is shared state that any other actor (or an
  // earlier test) may have switched, so asserting what it happens to hold right now is the same
  // mistake as asserting a count about the whole database. What matters is that a fresh deployment
  // starts OFF — the scheduled-email reversal must never switch itself on.
  const defaults = await prisma.$queryRawUnsafe<{ column_default: string | null }[]>(
    `SELECT column_default FROM information_schema.columns
     WHERE table_name = 'LearningSettings' AND column_name = 'deadlineRemindersEnabled'`
  );
  check(
    "chasing is OFF by default — a fresh deployment does not switch itself on",
    (defaults[0]?.column_default ?? "").toLowerCase().includes("false"),
    String(defaults[0]?.column_default)
  );

  await setRemindersEnabled(true, U.actor);
  check("it can be turned on", (await getLearningSettings()).deadlineRemindersEnabled);

  await setRemindersEnabled(false, U.actor);
  const off = await getLearningSettings();
  check("and off again", off.deadlineRemindersEnabled === false);
  check("recording who pulled the brake", off.remindersDisabledByName !== null, String(off.remindersDisabledByName));

  // Silencing must not hide the fact.
  const stillOverdue = (await overdueNow()).filter((o) => o.userId === U.onTrack);
  check(
    "switching the chasing off does NOT hide the overdue state",
    stillOverdue.length > 0,
    `${stillOverdue.length}`
  );

  await prisma.learningReminderLog.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await setRemindersEnabled(false, U.actor);

  // ── Cleanup ──────────────────────────────────────────────────────────
  await prisma.learningTrack.deleteMany({ where: { name: { startsWith: "VCT " } } });
  await prisma.courseEnrollment.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await prisma.learnerGroupMember.deleteMany({ where: { groupId: G } });
  await prisma.learnerGroup.deleteMany({ where: { id: G } });
  await prisma.course.deleteMany({ where: { id: { in: [...Object.values(C), "vct-c-late"] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
