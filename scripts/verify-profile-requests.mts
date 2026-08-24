/**
 * Throwaway-DB proof for spec 029 (profile change requests).
 *
 * The value logic (parse / serialise / "did it change?") is imported from the real registry, so
 * that half is the shipped code under test. The action-level guards (one open request, no
 * re-decision, approve writes one column) are replicated here minus their auth calls, matching
 * how 014/024 verify their actions; the real guarded path is exercised separately in the
 * Chromium pass.
 *
 * Run with POSTGRES_URL pointed at a throwaway DB.
 */
import { PrismaClient } from "@prisma/client";
import {
  REQUESTABLE_FIELDS,
  requestableField,
  currentValue,
  displayValue,
} from "../src/lib/profile/requestable";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const SELECT = {
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  dateOfBirth: true,
  maritalStatus: true,
  // Dependants joined the registry (2026-08-17): serialise() now reads them.
  dependants: {
    select: { name: true, dateOfBirth: true, kind: true },
    orderBy: { dateOfBirth: "asc" },
  },
} as const;

function serialiseParsed(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// --- submitProfileChangeRequest, minus requireUser ---
async function submit(userId: string, form: Record<string, string>, reason?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!user) return { error: "Profile not found." } as const;

  const existing = await prisma.profileChangeRequest.findFirst({
    where: { userId, fields: { some: { status: "PENDING" } } },
  });
  if (existing) return { error: "You already have a request awaiting HR." } as const;

  const changes: { field: string; requestedValue: string }[] = [];
  for (const field of REQUESTABLE_FIELDS) {
    const raw = form[field.key];
    if (raw === undefined) continue;
    const parsed = field.parse(raw);
    if (!parsed.ok) return { error: parsed.error } as const;
    const normalised = serialiseParsed(parsed.value);
    if (normalised === field.serialise(user)) continue;
    changes.push({ field: field.key, requestedValue: normalised });
  }
  if (changes.length === 0) return { error: "Nothing has changed." } as const;

  const req = await prisma.profileChangeRequest.create({
    data: { userId, reason: reason ?? null, fields: { create: changes } },
    include: { fields: true },
  });
  return { ok: true, req } as const;
}

// --- approveProfileField / declineProfileField, minus requireAdmin ---
async function approve(fieldId: string, adminId: string) {
  const row = await prisma.profileChangeField.findUnique({
    where: { id: fieldId },
    include: { request: { select: { userId: true } } },
  });
  if (!row) return { error: "gone" } as const;
  if (row.status !== "PENDING") return { error: "already decided" } as const;
  const field = requestableField(row.field);
  if (!field) return { error: "unknown field" } as const;
  const parsed = field.parse(row.requestedValue);
  if (!parsed.ok) return { error: parsed.error } as const;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.request.userId },
      data: { [field.key]: parsed.value },
    }),
    prisma.profileChangeField.update({
      where: { id: fieldId },
      data: { status: "APPROVED", decidedById: adminId, decidedAt: new Date(), decisionReason: null },
    }),
  ]);
  return { ok: true } as const;
}

async function decline(fieldId: string, adminId: string, reason: string) {
  if (reason.trim() === "") return { error: "reason required" } as const;
  const row = await prisma.profileChangeField.findUnique({ where: { id: fieldId } });
  if (!row) return { error: "gone" } as const;
  if (row.status !== "PENDING") return { error: "already decided" } as const;
  await prisma.profileChangeField.update({
    where: { id: fieldId },
    data: { status: "DECLINED", decisionReason: reason, decidedById: adminId, decidedAt: new Date() },
  });
  return { ok: true } as const;
}

const pendingCount = () =>
  prisma.profileChangeRequest.count({ where: { fields: { some: { status: "PENDING" } } } });

async function main() {
  await prisma.profileChangeField.deleteMany({});
  await prisma.profileChangeRequest.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: ["v029.emp@x.test", "v029.hr@x.test"] } } });

  const emp = await prisma.user.create({
    data: {
      email: "v029.emp@x.test",
      name: "Verify Employee",
      emergencyContactName: "Nadia Rashad",
      emergencyContactRelationship: "Sister",
      emergencyContactPhone: "+201229876543",
      dateOfBirth: new Date("1990-05-05T00:00:00.000Z"),
      maritalStatus: "MARRIED",
      updatedAt: new Date(),
    },
  });
  const hr = await prisma.user.create({
    data: { email: "v029.hr@x.test", name: "Verify HR", role: "HR_ADMIN", updatedAt: new Date() },
  });

  console.log("\nRegistry (pure)");
  const dob = requestableField("dateOfBirth")!;
  check("a valid ISO date parses to UTC midnight", (dob.parse("1990-05-05") as any).value?.toISOString() === "1990-05-05T00:00:00.000Z");
  check("31 February is rejected, not rolled into March", dob.parse("2026-02-31").ok === false);
  check("a future date of birth is rejected", dob.parse("2999-01-01").ok === false);
  check("an empty date means 'clear it'", (dob.parse("") as any).value === null);
  check("a date round-trips serialise → parse unchanged", dob.serialise({ ...emp } as any) === "1990-05-05");
  const marital = requestableField("maritalStatus")!;
  check("an unrecognised marital status is rejected", marital.parse("PARTNERED").ok === false);
  check("display renders a stored enum for a person", displayValue("maritalStatus", "DIVORCED") === "Divorced");
  check("display renders an empty value as an em dash", displayValue("emergencyContactName", "") === "—");
  check("an unknown key has no registry entry", requestableField("monthlySalary") === null);

  console.log("\nSubmission");
  const nothing = await submit(emp.id, {
    emergencyContactName: "Nadia Rashad",
    maritalStatus: "MARRIED",
    dateOfBirth: "1990-05-05",
  });
  check("a submission with nothing changed is refused", "error" in nothing);
  check("…and creates no request", (await prisma.profileChangeRequest.count()) === 0);

  const whitespace = await submit(emp.id, { emergencyContactName: "  Nadia Rashad  " });
  check("whitespace-only difference is not a change", "error" in whitespace);

  const bad = await submit(emp.id, { dateOfBirth: "1990-13-45" });
  check("an invalid date is refused at submission", "error" in bad);

  const sent = await submit(
    emp.id,
    {
      emergencyContactName: "Nadia Rashad-Fouad",
      emergencyContactRelationship: "Sister",
      emergencyContactPhone: "+201005550199",
      dateOfBirth: "1990-05-03",
      maritalStatus: "MARRIED",
    },
    "She remarried and changed her number."
  );
  check("a real change is recorded", "ok" in sent);
  const req = (sent as any).req;
  check("only the 3 changed fields are recorded, not all 5", req.fields.length === 3);
  check(
    "…and they are exactly the fields that differ",
    new Set(req.fields.map((f: any) => f.field)).size === 3 &&
      ["emergencyContactName", "emergencyContactPhone", "dateOfBirth"].every((k) =>
        req.fields.some((f: any) => f.field === k)
      )
  );

  const after = await prisma.user.findUnique({ where: { id: emp.id }, select: SELECT });
  check(
    "submitting does NOT touch the employee record",
    after!.emergencyContactName === "Nadia Rashad" &&
      after!.emergencyContactPhone === "+201229876543" &&
      after!.dateOfBirth?.toISOString() === "1990-05-05T00:00:00.000Z"
  );

  const second = await submit(emp.id, { emergencyContactName: "Someone Else" });
  check("a second request while one is open is refused", "error" in second);
  check("HR's pending count sees exactly one request", (await pendingCount()) === 1);

  console.log("\nDecisions, field by field");
  const nameField = req.fields.find((f: any) => f.field === "emergencyContactName");
  const phoneField = req.fields.find((f: any) => f.field === "emergencyContactPhone");
  const dobField = req.fields.find((f: any) => f.field === "dateOfBirth");

  check("approving one field succeeds", "ok" in (await approve(nameField.id, hr.id)));
  const afterOne = await prisma.user.findUnique({ where: { id: emp.id }, select: SELECT });
  check("…writes that column", afterOne!.emergencyContactName === "Nadia Rashad-Fouad");
  check(
    "…and leaves every undecided field untouched",
    afterOne!.emergencyContactPhone === "+201229876543" &&
      afterOne!.dateOfBirth?.toISOString() === "1990-05-05T00:00:00.000Z"
  );
  check("re-approving a decided field is refused", "error" in (await approve(nameField.id, hr.id)));
  check("re-declining a decided field is refused", "error" in (await decline(nameField.id, hr.id, "no")));

  check("declining with no reason is refused", "error" in (await decline(dobField.id, hr.id, "  ")));
  check("declining with a reason succeeds", "ok" in (await decline(dobField.id, hr.id, "Passport shows 5 May.")));
  const afterDecline = await prisma.user.findUnique({ where: { id: emp.id }, select: SELECT });
  check(
    "a declined field is NOT written to the record",
    afterDecline!.dateOfBirth?.toISOString() === "1990-05-05T00:00:00.000Z"
  );
  const declined = await prisma.profileChangeField.findUnique({ where: { id: dobField.id } });
  check("the decline reason is stored against that field", declined!.decisionReason === "Passport shows 5 May.");
  check("the deciding admin and time are recorded", declined!.decidedById === hr.id && declined!.decidedAt !== null);

  check("the request is still pending with one field undecided", (await pendingCount()) === 1);
  check("the employee still cannot open a second request", "error" in (await submit(emp.id, { emergencyContactName: "X" })));

  console.log("\nCurrent value is read at review time (FR-010)");
  // HR edits the record directly while the last field sits in the queue.
  await prisma.user.update({
    where: { id: emp.id },
    data: { emergencyContactPhone: "+201110001111" },
  });
  const nowUser = await prisma.user.findUnique({ where: { id: emp.id }, select: SELECT });
  check(
    "the 'was' side shows HR's newer value, not the one at submission",
    currentValue("emergencyContactPhone", nowUser!) === "+201110001111"
  );
  check(
    "the stored request still holds what the employee asked for",
    (await prisma.profileChangeField.findUnique({ where: { id: phoneField.id } }))!.requestedValue ===
      "+201005550199"
  );

  console.log("\nClosing out");
  check("approving the last field succeeds", "ok" in (await approve(phoneField.id, hr.id)));
  check("the request leaves the pending count", (await pendingCount()) === 0);
  const closed = await prisma.user.findUnique({ where: { id: emp.id }, select: SELECT });
  check(
    "the record holds the approved values and not the declined one",
    closed!.emergencyContactName === "Nadia Rashad-Fouad" &&
      closed!.emergencyContactPhone === "+201005550199" &&
      closed!.dateOfBirth?.toISOString() === "1990-05-05T00:00:00.000Z"
  );
  check("a new request is now allowed", "ok" in (await submit(emp.id, { maritalStatus: "DIVORCED" })));

  console.log("\nClearing a field");
  const clearReq = await prisma.profileChangeRequest.findFirst({
    where: { userId: emp.id, fields: { some: { status: "PENDING" } } },
    include: { fields: true },
  });
  const maritalField = clearReq!.fields[0];
  await approve(maritalField.id, hr.id);
  check(
    "an enum change is written",
    (await prisma.user.findUnique({ where: { id: emp.id } }))!.maritalStatus === "DIVORCED"
  );
  const clearing = await submit(emp.id, { emergencyContactRelationship: "" });
  check("proposing an empty value is a change, not a no-op", "ok" in clearing);
  await approve((clearing as any).req.fields[0].id, hr.id);
  check(
    "…and approving clears the column to null",
    (await prisma.user.findUnique({ where: { id: emp.id } }))!.emergencyContactRelationship === null
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
