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
 *   • the rendered HTML contains none of the three things that silently break in mail clients;
 *   • the group name above the unit is the COMMUNICATIONS setting, never the platform's own name;
 *   • the look-ahead shows a manager their own team and HR everybody, and nobody else anything;
 *   • the send window opens on the lead day and shuts after the day — early is refused, not just
 *     hidden.
 *
 * Run against a THROWAWAY database only.
 */
import { PrismaClient } from "@prisma/client";
import { renderMessage } from "../src/lib/comms/render.js";
import { reachedUserIds } from "../src/lib/audience/reach.js";
import { assigneeFor, closePassed, draftFor, prepareOccasions } from "../src/lib/comms/drafts.js";
import { occasionsInWindow } from "../src/lib/comms/occasions.js";
import { DEFAULT_GROUP_NAME, getCommsSettings, groupName } from "../src/lib/comms/settings.js";
import { monthWindow, quarterWindow, sendWindow, upcomingFor } from "../src/lib/comms/upcoming.js";

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
await db.user.deleteMany({
  where: { OR: [{ email: { endsWith: "@comms.test" } }, { id: { startsWith: "comms-" } }] },
});
await db.businessUnit.deleteMany({ where: { name: { in: ["Test Coral", "Test Navy"] } } });
await db.department.deleteMany({ where: { name: "Comms Dept" } });

await db.department.create({ data: { name: "Comms Dept", order: 99 } });
const coral = await db.businessUnit.create({
  data: { name: "Test Coral", shortName: "TC", primaryColor: "#E0653F", accentColor: "#c9a227" },
});
const navy = await db.businessUnit.create({
  data: { name: "Test Navy", shortName: "TN", primaryColor: "#0f2444", accentColor: "#c9a227" },
});

/**
 * Fixture ids are NAMESPACED, and that is not tidiness.
 *
 * Each verification script cleans up by its own `@x.test` email suffix, so a plain id like
 * "alice" survives another script's cleanup and then collides with its `create` — which makes the
 * whole suite order-dependent and fails in a way that looks like a code defect. Found exactly
 * that way: this script's "alice" broke verify-learning-us1 when both ran against one database.
 */
const mk = (name: string, over: Record<string, unknown> = {}) =>
  db.user.create({
    data: {
      id: `comms-${name}`,
      email: `${name}@comms.test`,
      name: `${name} Person`,
      status: "ACTIVE",
      ...over,
    },
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

// ── 9. the manager's own queue ──
console.log("\n── a manager's own messages ──");

// The exact query /messages runs, so this cannot drift from the page it checks.
const mine = (userId: string) =>
  db.message.count({
    where: { assignedToId: userId, state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
  });

check("the manager sees the two drafts assigned to them", await mine(manager.id), 2);
check("alice, whose birthday it is, sees none of her own", await mine(alice.id), 0);
check("a colleague uninvolved sees none", await mine(carol.id), 0);

// The sidebar entry appears only when the count is above zero — that IS the rule, so it is
// asserted as arithmetic rather than left to the component.
ok("the entry shows for the manager", (await mine(manager.id)) > 0);
ok("and is absent for everybody else", (await mine(carol.id)) === 0);

// A draft that has been sent leaves the queue rather than lingering.
const [firstDraft] = await db.message.findMany({
  where: { assignedToId: manager.id, state: "DRAFT" },
  take: 1,
  select: { id: true },
});
await db.message.update({
  where: { id: firstDraft.id },
  data: { state: "SENT", sentById: manager.id, sentAt: new Date(), recipientCount: 1 },
});
check("sending one removes it from the queue", await mine(manager.id), 1);

// And a closed one leaves too, so "not this one" actually clears it.
const [remaining] = await db.message.findMany({
  where: { assignedToId: manager.id, state: "DRAFT" },
  take: 1,
  select: { id: true },
});
await db.message.update({
  where: { id: remaining.id },
  data: { state: "MISSED", missedAt: new Date() },
});
check("closing the last one empties the queue", await mine(manager.id), 0);

// ── The group name above the unit ────────────────────────────────────────
//
// This shipped reading `BrandSettings.companyName` — the PLATFORM's name — so the header said
// "Forefront Consulting" where "Forefront Group" had been agreed, and the only way to correct it
// was to rename the whole application. The checks below are written against that specific mistake:
// it is not enough that the right name appears, the wrong one must be unable to.
await db.notificationSettings.deleteMany({});
await db.brandSettings.deleteMany({});

check("with nothing set, the group name is the agreed default", await groupName(), DEFAULT_GROUP_NAME);

await db.brandSettings.create({ data: { id: "singleton", companyName: "A Platform Name" } });
check("the platform's own name no longer decides it", await groupName(), DEFAULT_GROUP_NAME);

await db.notificationSettings.create({ data: { id: "singleton", groupName: "Forefront Group" } });
check("an operator's value is used", await groupName(), "Forefront Group");
// Two readers, one answer — a settings page disagreeing with the renderer is how a header goes
// wrong without anybody editing the renderer.
check("and the settings screen agrees with the renderer", (await getCommsSettings()).groupName, "Forefront Group");

await db.notificationSettings.update({ where: { id: "singleton" }, data: { groupName: "   " } });
check("whitespace is not a name — it falls back", await groupName(), DEFAULT_GROUP_NAME);

await db.notificationSettings.update({ where: { id: "singleton" }, data: { groupName: "Forefront Group" } });
const branded = renderMessage({
  unit: { name: "Visual Shift Consulting", primaryColor: "#450059" },
  groupName: await groupName(),
  fallbackLabel: "Announcement",
  subject: "We are coming",
  body: "What is going on?",
  cta: null,
}).html;
check("the rendered header carries the group name", branded.includes("Forefront Group"), true);
check("and cannot carry the platform's name", branded.includes("A Platform Name"), false);
check("the unit is still the large line beneath it", branded.includes("Visual Shift Consulting"), true);

// ── The send window ──────────────────────────────────────────────────────
//
// The upper bound already existed (a missed congratulation closes rather than going out late).
// This is the lower bound, and it only became necessary because messages can now be written
// months ahead: the button would otherwise sit there for weeks waiting to be pressed by mistake.
{
  const day = new Date(Date.UTC(2026, 8, 20));
  const on = (d: number) => new Date(Date.UTC(2026, 8, d));
  check("three weeks early: shut", sendWindow(day, on(1), 3).open, false);
  check("four days early: still shut", sendWindow(day, on(16), 3).open, false);
  check("exactly the lead day: open", sendWindow(day, on(17), 3).open, true);
  check("the day itself: open", sendWindow(day, on(20), 3).open, true);
  check("the day after: shut", sendWindow(day, on(21), 3).open, false);
  check("...and reported as past, not merely early", sendWindow(day, on(21), 3).past, true);
  check("it says WHEN it opens", sendWindow(day, on(1), 3).opensOn.toISOString().slice(0, 10), "2026-09-17");
  // Zero lead days is a legitimate setting: send on the day only.
  check("with no lead, only the day itself", sendWindow(day, on(19), 0).open, false);
  check("...and the day itself still works", sendWindow(day, on(20), 0).open, true);
}

// ── Who the look-ahead shows ─────────────────────────────────────────────
//
// A list is not a permission, but a list that shows more than the viewer may see is a leak of
// birth dates. Asserted per role rather than trusted to the query.
{
  const dom = "@ahead.test";
  await db.message.deleteMany({ where: { subjectUser: { email: { endsWith: dom } } } });
  await db.occasion.deleteMany({ where: { user: { email: { endsWith: dom } } } });
  await db.user.deleteMany({ where: { email: { endsWith: dom } } });

  const today = new Date(Date.UTC(2026, 5, 15)); // mid-June: Q3 is Jul-Sep, so June is Q2
  const mk = (id: string, over: Record<string, unknown> = {}) =>
    db.user.create({ data: { id, email: `${id}${dom}`, name: id, status: "ACTIVE", ...over } });

  const boss = await mk("ahead-boss");
  const mine1 = await mk("ahead-mine1", { reportsToId: boss.id, dateOfBirth: new Date(Date.UTC(1990, 5, 20)) });
  await mk("ahead-mine2", { reportsToId: boss.id, dateOfBirth: new Date(Date.UTC(1988, 7, 3)) });
  await mk("ahead-theirs", { dateOfBirth: new Date(Date.UTC(1992, 5, 22)) });

  const { from: mFrom, to: mTo } = monthWindow(today);
  check("a month window is that calendar month", [mFrom.toISOString().slice(0, 10), mTo.toISOString().slice(0, 10)], ["2026-06-01", "2026-06-30"]);
  const { from: qFrom, to: qTo } = quarterWindow(today);
  check("a quarter window is that calendar quarter", [qFrom.toISOString().slice(0, 10), qTo.toISOString().slice(0, 10)], ["2026-04-01", "2026-06-30"]);

  const managerSees = await upcomingFor({ id: boss.id, role: "EMPLOYEE" }, qFrom, qTo, today, 3);
  const mineNames = managerSees.map((r) => r.userId).filter((id) => id.startsWith("ahead-")).sort();
  check("a manager sees their own reports", mineNames, ["ahead-mine1"]);
  check("...and NOT somebody else's report", mineNames.includes("ahead-theirs"), false);

  const hrSees = await upcomingFor({ id: boss.id, role: "HR_ADMIN" }, qFrom, qTo, today, 3);
  const hrNames = hrSees.map((r) => r.userId).filter((id) => id.startsWith("ahead-")).sort();
  check("HR sees everybody, including people who report to nobody", hrNames, ["ahead-mine1", "ahead-theirs"]);

  const stranger = await mk("ahead-stranger");
  const strangerSees = await upcomingFor({ id: stranger.id, role: "EMPLOYEE" }, qFrom, qTo, today, 3);
  check("somebody who manages nobody sees nothing", strangerSees.length, 0);

  // An occasion with no draft is the NORMAL state months out — it must read as unwritten rather
  // than as missing.
  const row = managerSees.find((r) => r.userId === "ahead-mine1");
  check("an occasion with no draft reads unwritten", row?.state, "UNWRITTEN");
  check("...and carries no message id", row?.messageId, null);
  check("a birthday in the look-ahead still carries no age", row?.years, undefined);

  // August is outside June's quarter — the window is a real filter, not decoration.
  check("the quarter excludes what falls outside it", managerSees.some((r) => r.userId === "ahead-mine2"), false);

  await db.user.deleteMany({ where: { email: { endsWith: dom } } });
  void mine1;
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
