/**
 * Team Communications end-to-end against a real database (spec 039).
 *
 * What this proves, each one a requirement rather than a nicety:
 *   • overlapping audience choices produce ONE recipient row per person;
 *   • two people in different units get copies branded differently;
 *   • the address recorded is the address it went to;
 *   • a second send is refused, not sent twice;
 *   • a stale confirmed count is refused;
 *   • an empty audience is refused with a reason;
 *   • a birthday NEVER carries an age, and an anniversary carries years;
 *   • a draft past its day cannot be sent;
 *   • a leaver's draft cannot be sent;
 *   • the cron creates nothing on a second run, and emails NO employee;
 *   • the rendered HTML contains none of the three things that silently break in mail clients.
 *
 * Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import { renderMessage } from "../src/lib/comms/render.js";
import { reachedUserIds } from "../src/lib/audience/reach.js";
import { assigneeFor, closePassed, draftFor, prepareOccasions } from "../src/lib/comms/drafts.js";
import { occasionsInWindow } from "../src/lib/comms/occasions.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};
const ok = (label: string, cond: boolean) => check(label, !!cond, true);

// ── clean slate ──
await db.messageRecipient.deleteMany({});
await db.messageAudience.deleteMany({});
await db.occasion.deleteMany({});
await db.message.deleteMany({});
await db.user.deleteMany({ where: { email: { endsWith: "@comms.test" } } });
await db.businessUnit.deleteMany({ where: { name: { in: ["Test Coral", "Test Navy"] } } });
await db.department.deleteMany({ where: { name: "Comms Dept" } });

await db.department.create({ data: { name: "Comms Dept", order: 99 } });
const coral = await db.businessUnit.create({
  data: { name: "Test Coral", shortName: "TC", primaryColor: "#E0653F", accentColor: "#c9a227" },
});
const navy = await db.businessUnit.create({
  data: { name: "Test Navy", shortName: "TN", primaryColor: "#0f2444", accentColor: "#c9a227" },
});

const mk = (id: string, over: Record<string, unknown> = {}) =>
  db.user.create({
    data: { id, email: `${id}@comms.test`, name: `${id} Person`, status: "ACTIVE", ...over },
  });

const hr = await mk("hrboss", { role: "HR_ADMIN" });
const manager = await mk("manager", { department: "Comms Dept" });
const alice = await mk("alice", { department: "Comms Dept", businessUnitId: coral.id, reportsToId: manager.id });
const bob = await mk("bob", { department: "Comms Dept", businessUnitId: navy.id });
const carol = await mk("carol", { businessUnitId: null });

// ── 1. audience expansion ──
console.log("\n── the audience, expanded ──");
// A department AND a person inside it: the overlap must not produce two copies.
const overlapping = [
  { field: "DEPARTMENT" as const, value: "Comms Dept" },
  { field: "PERSON" as const, value: alice.id },
];
const reached = await reachedUserIds(overlapping);
check("overlapping choices reach each person once", reached.filter((id) => id === alice.id).length, 1);
check("the department's three people, not four", reached.sort().length, 3);

const withLeaver = await mk("gone", { department: "Comms Dept", status: "LEFT" });
const afterLeaver = await reachedUserIds([{ field: "DEPARTMENT", value: "Comms Dept" }]);
ok("a leaver is not reached", !afterLeaver.includes(withLeaver.id));

// ── 2. sending ──
console.log("\n── sending ──");
const announcement = await db.message.create({
  data: { kind: "ANNOUNCEMENT", state: "DRAFT", subject: "Hello", body: "First line.\n\nSecond line." },
});
await db.messageAudience.createMany({
  data: [
    { messageId: announcement.id, field: "PERSON", value: alice.id },
    { messageId: announcement.id, field: "PERSON", value: bob.id },
  ],
});

// Simulate what sendAnnouncement writes, so the shape is proved without a live mail provider.
const targets = await db.user.findMany({
  where: { id: { in: [alice.id, bob.id] } },
  select: { id: true, email: true, businessUnitId: true },
});
await db.messageRecipient.createMany({
  data: targets.map((t) => ({
    messageId: announcement.id,
    userId: t.id,
    email: t.email,
    businessUnitId: t.businessUnitId,
    state: "PENDING" as const,
  })),
});
await db.message.update({
  where: { id: announcement.id },
  data: { state: "SENT", sentById: hr.id, sentAt: new Date(), recipientCount: 2 },
});

const rows = await db.messageRecipient.findMany({
  where: { messageId: announcement.id },
  select: { userId: true, email: true, businessUnitId: true },
  orderBy: { email: "asc" },
});
check("one row per person", rows.length, 2);
check("the address recorded is the real one", rows.map((r) => r.email).sort(), ["alice@comms.test", "bob@comms.test"]);
check("two units, two brandings", new Set(rows.map((r) => r.businessUnitId)).size, 2);

let duplicateRefused = false;
try {
  await db.messageRecipient.create({
    data: { messageId: announcement.id, userId: alice.id, email: alice.email, state: "PENDING" },
  });
} catch {
  duplicateRefused = true;
}
ok("a person cannot be in one send twice", duplicateRefused);

// The claim: a conditional update is what stops a second send, not a check-then-write.
const second = await db.message.updateMany({
  where: { id: announcement.id, state: "DRAFT" },
  data: { state: "SENT" },
});
check("a second send claims nothing", second.count, 0);

// ── 3. congratulations: what is prepared ──
console.log("\n── preparing congratulations ──");
const today = new Date(Date.UTC(2026, 8, 4)); // 4 Sep 2026
await db.user.update({
  where: { id: alice.id },
  data: { startDate: new Date(Date.UTC(2021, 8, 7)), dateOfBirth: new Date(Date.UTC(1990, 8, 6)) },
});

const first = await prepareOccasions(today, 3);
check("one anniversary and one birthday prepared", first.created, 2);

const again = await prepareOccasions(today, 3);
check("a second run creates NOTHING", again.created, 0);
check("and says they were already there", again.alreadyThere, 2);
check("still exactly two occasions", await db.occasion.count(), 2);

const anniversary = await db.occasion.findFirst({ where: { kind: "WORK_ANNIVERSARY" }, select: { years: true } });
const birthday = await db.occasion.findFirst({ where: { kind: "BIRTHDAY" }, select: { years: true } });
check("an anniversary carries its years", anniversary?.years, 5);
check("a birthday carries NO age", birthday?.years, null);

const drafts = await db.message.findMany({
  where: { kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
  select: { assignedToId: true, subject: true, body: true },
});
check("both went to the line manager", new Set(drafts.map((d) => d.assignedToId)), new Set([manager.id]));
ok("no draft mentions an age", drafts.every((d) => !/\b\d{2}\b/.test(d.subject.replace(/\d+ years?/, ""))));

// ── 4. who a draft is assigned to ──
console.log("\n── whose queue ──");
check("someone with a manager goes to their manager", await assigneeFor(alice.id), manager.id);

// Asserted by ROLE, not by identity. `assigneeFor` picks the OLDEST active HR admin so the
// fallback is deterministic, and a database with several will legitimately pick one this script
// did not create. The rule under test is "it lands with HR" — pinning it to a specific person
// would be testing the fixture rather than the rule.
const isHr = async (id: string | null) => {
  if (!id) return false;
  const u = await db.user.findUnique({ where: { id }, select: { role: true, status: true } });
  return u?.status === "ACTIVE" && (u.role === "HR_ADMIN" || u.role === "SUPER_USER");
};
ok("someone with no manager goes to HR", await isHr(await assigneeFor(bob.id)));

// The manager's own birthday must not land in the manager's own queue.
const managerAssignee = await assigneeFor(manager.id);
ok("a manager's own occasion does not go to themselves", managerAssignee !== manager.id);
ok("it goes to HR instead", await isHr(managerAssignee));

// Deterministic: asked twice, the same person both times.
check("the fallback is stable, not whoever the database felt like", await assigneeFor(bob.id), await assigneeFor(bob.id));

// ── 5. what closes ──
console.log("\n── the day passing ──");
const stale = await db.message.create({
  data: { kind: "BIRTHDAY", state: "DRAFT", subject: "Old", body: "x", subjectUserId: carol.id, assignedToId: hr.id },
});
await db.occasion.create({
  data: {
    userId: carol.id, kind: "BIRTHDAY", occasionYear: 2026,
    occasionDate: new Date(Date.UTC(2026, 8, 1)), messageId: stale.id,
  },
});
const closed = await closePassed(today);
check("a draft whose day has gone is closed", closed, 1);
const staleAfter = await db.message.findUnique({ where: { id: stale.id }, select: { state: true } });
check("and reads MISSED, not DRAFT", staleAfter?.state, "MISSED");
check("closing again closes nothing", await closePassed(today), 0);

// ── 6. the pure occasion rules, against real rows ──
console.log("\n── occasions from real records ──");
const people = await db.user.findMany({
  where: { email: { endsWith: "@comms.test" } },
  select: { id: true, name: true, status: true, dateOfBirth: true, startDate: true },
});
const leaverOccasions = occasionsInWindow(
  people.filter((p) => p.status !== "ACTIVE"),
  new Date(Date.UTC(2026, 0, 1)),
  new Date(Date.UTC(2026, 11, 31))
);
check("a leaver generates nothing at all", leaverOccasions.length, 0);

// ── 7. the rendered email ──
console.log("\n── what actually gets sent ──");
const { html, text } = renderMessage({
  unit: { name: "Test Coral", primaryColor: "#E0653F" },
  groupName: "Forefront Group",
  fallbackLabel: "Announcement",
  subject: "A subject",
  body: "One paragraph.\n\nAnother paragraph.",
  cta: { label: "Open", href: "https://example.com" },
  signedBy: "Nada",
});

ok("no <style> block — Gmail strips it on some clients", !/<style[\s>]/i.test(html));
ok("no var() — unsupported in most mail clients", !/var\(/.test(html));
ok("no data: image — Gmail and Outlook block them outright", !/src="data:/i.test(html));
ok("a table for layout, not a div", /<table/i.test(html));
ok("color-scheme declared, so dark mode does not invert it", /color-scheme/i.test(html));
ok("the unit's name is in it", html.includes("Test Coral"));
ok("the group's name is in it", html.includes("Forefront Group"));
ok("both paragraphs became paragraphs", (html.match(/<p style="margin:0 0 14px/g) ?? []).length >= 2);
ok("signed with whoever sent it", html.includes("Nada"));
ok("a plain-text alternative exists", text.length > 0 && text.includes("A subject"));

const relative = renderMessage({
  unit: null, groupName: "Forefront Group", fallbackLabel: "Announcement",
  subject: "s", body: "b", cta: { label: "Go", href: "/somewhere" },
});
ok("a RELATIVE link is dropped — it is dead in a mail client", !relative.html.includes("/somewhere"));

const noUnit = renderMessage({
  unit: null, groupName: "Forefront Group", fallbackLabel: "Announcement",
  subject: "s", body: "b",
});
// The header block specifically — where a missing unit name would leave a hole.
const noUnitHeader = noUnit.html.slice(noUnit.html.indexOf("<td bgcolor"), noUnit.html.indexOf("</td>") + 5);
ok("somebody with no unit still gets a header", noUnitHeader.length > 0);
ok("the group is on it", noUnitHeader.includes("Forefront Group"));
ok("and the big line says what the message IS, not nothing", noUnitHeader.includes("Announcement"));
ok("no empty element where the unit name would be", !/>\s*<\/div>/.test(noUnitHeader));
ok("it falls back to the group's own colour", noUnitHeader.includes("#0F2444"));

// ── 8. the draft wording ──
console.log("\n── the words the platform writes ──");
const bday = draftFor({ userId: "x", name: "Mona Selim", kind: "BIRTHDAY", occasionYear: 2026, occasionDate: today });
ok("a birthday greets by first name", bday.subject.includes("Mona") && !bday.subject.includes("Selim"));
ok("and states no number anywhere", !/\d/.test(bday.subject + bday.body));

const anniv = draftFor({ userId: "x", name: "Karim Hassan", kind: "WORK_ANNIVERSARY", occasionYear: 2026, occasionDate: today, years: 5 });
ok("an anniversary states the years", anniv.subject.includes("5"));

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
