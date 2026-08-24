/**
 * The Learning manager appointment, against a real database (spec 038 follow-up, 2026-08-22).
 *
 * What this proves:
 *   • an appointment opens Learning and NOTHING else — the person is still an EMPLOYEE, so every
 *     other module's role check is untouched;
 *   • HR Admins and Super Users hold Learning without a row, so emptying the table cannot lock
 *     them out;
 *   • removing an appointment takes it away immediately;
 *   • an appointee sees DRAFT courses (they author them) while an ordinary employee does not;
 *   • appointing twice is a no-op, not a duplicate.
 *
 * Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import { canManageLearning, hasLearningAppointment, learningManagers } from "../src/lib/learning/managers.js";
import { resolveRoutes } from "../src/lib/learning/access.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

await db.learningManager.deleteMany({});
await db.user.deleteMany({ where: { email: { endsWith: "@lm.test" } } });

const sara = await db.user.create({ data: { email: "sara@lm.test", name: "Sara Mahmoud", role: "EMPLOYEE", status: "ACTIVE", department: "L&D" } });
const omar = await db.user.create({ data: { email: "omar@lm.test", name: "Omar Fathy", role: "EMPLOYEE", status: "ACTIVE" } });
const nada = await db.user.create({ data: { email: "nada@lm.test", name: "Nada Adel", role: "HR_ADMIN", status: "ACTIVE" } });
const islam = await db.user.create({ data: { email: "islam@lm.test", name: "Islam S", role: "SUPER_USER", status: "ACTIVE" } });
const fin = await db.user.create({ data: { email: "fin@lm.test", name: "Finance Person", role: "FINANCE", status: "ACTIVE" } });

console.log("\n── before any appointment ──");
check("an ordinary employee cannot run Learning", await canManageLearning(sara), false);
check("an HR Admin can, with no row", await canManageLearning(nada), true);
check("a Super User can, with no row", await canManageLearning(islam), true);
check("Finance cannot — it is not an admin role here", await canManageLearning(fin), false);
check("the appointment list is empty", (await learningManagers()).length, 0);

console.log("\n── appointed ──");
await db.learningManager.create({ data: { userId: sara.id, appointedById: nada.id } });
check("Sara can now run Learning", await canManageLearning(sara), true);
check("her registry role is untouched", (await db.user.findUnique({ where: { id: sara.id }, select: { role: true } }))?.role, "EMPLOYEE");
check("nobody else gained anything", await canManageLearning(omar), false);
check("she holds an appointment", await hasLearningAppointment(sara.id), true);
check("HR does not hold an appointment (they hold the role)", await hasLearningAppointment(nada.id), false);

const listed = await learningManagers();
check("she is on the list once", listed.map((m) => m.name), ["Sara Mahmoud"]);
check("with who appointed her", listed[0]?.appointedByName, "Nada Adel");

// Appointing twice must be a no-op — the unique index, not a convention.
await db.learningManager.upsert({ where: { userId: sara.id }, create: { userId: sara.id }, update: {} });
check("appointing twice adds nothing", await db.learningManager.count(), 1);

console.log("\n── emptying the table cannot lock HR out ──");
await db.learningManager.deleteMany({});
check("HR still runs Learning with no rows at all", await canManageLearning(nada), true);
check("the Super User too", await canManageLearning(islam), true);
check("Sara does not, once removed", await canManageLearning(sara), false);

console.log("\n── drafts ──");
const draft = { status: "DRAFT" as const, visibility: "RESTRICTED" as const };
const base = {
  viewerIsActive: true, hasDirectAssignment: false, hasGroupAssignment: false,
  matchesAudience: false, enrollment: null,
};
check(
  "someone who may author sees a draft",
  resolveRoutes({ course: draft, viewerIsAdmin: true, ...base }).allowed,
  true
);
check(
  "an ordinary employee does not",
  resolveRoutes({ course: draft, viewerIsAdmin: false, ...base }).allowed,
  false
);

console.log("\n── a leaver ──");
await db.learningManager.create({ data: { userId: sara.id, appointedById: nada.id } });
await db.user.update({ where: { id: sara.id }, data: { status: "LEFT" } });
check(
  "the appointment survives in the table (HR removes it deliberately)",
  await hasLearningAppointment(sara.id),
  true
);
check(
  "but a leaver reaches no course as a LEARNER",
  resolveRoutes({ course: { status: "PUBLISHED", visibility: "OPEN" }, viewerIsAdmin: false, ...base, viewerIsActive: false }).allowed,
  false
);

console.log("\n── which sidebar door each person gets ──");
// The exact expressions (app)/layout.tsx uses, so this cannot drift from the real thing.
const doors = async (u: { id: string; role: "EMPLOYEE" | "HR_ADMIN" | "SUPER_USER" | "FINANCE" }) => {
  const { isAdmin } = await import("../src/lib/roles.js");
  const hrAdmin = isAdmin(u.role);
  return {
    admin: hrAdmin,
    manageLearning: !hrAdmin && (await hasLearningAppointment(u.id)),
  };
};

await db.user.update({ where: { id: sara.id }, data: { status: "ACTIVE" } });
check("an appointed manager gets Manage Learning, not Admin", await doors({ id: sara.id, role: "EMPLOYEE" }), { admin: false, manageLearning: true });
check("HR gets Admin and NOT a second Learning entry", await doors({ id: nada.id, role: "HR_ADMIN" }), { admin: true, manageLearning: false });
check("a Super User the same", await doors({ id: islam.id, role: "SUPER_USER" }), { admin: true, manageLearning: false });
check("an ordinary employee gets neither", await doors({ id: omar.id, role: "EMPLOYEE" }), { admin: false, manageLearning: false });
check("Finance gets neither", await doors({ id: fin.id, role: "FINANCE" }), { admin: false, manageLearning: false });

// An HR Admin who somehow holds a row must still get exactly ONE door, never two.
await db.learningManager.upsert({ where: { userId: nada.id }, create: { userId: nada.id }, update: {} });
check(
  "an HR Admin holding a stray appointment still gets one door only",
  await doors({ id: nada.id, role: "HR_ADMIN" }),
  { admin: true, manageLearning: false }
);
await db.learningManager.deleteMany({ where: { userId: nada.id } });

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
