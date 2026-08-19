"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { expandRange, getHolidaySet } from "@/lib/holidays";
import { sendEmail, sendBulkEmail } from "@/lib/email/client";
import {
  holidayDayReturned,
  renderHolidayAnnouncement,
  type AnnouncementLanguage,
} from "@/lib/email/templates";
import { buildAnnouncementDraft } from "@/lib/timeoff/announcement";
import { fetchHolidaySuggestions } from "@/lib/timeoff/holiday-source";

// Holiday administration (spec 035, evolved by spec 037). Every rule lives here because these
// actions are the ONLY write path to the holidays log — including the non-overlap invariant,
// which Prisma cannot express as a constraint.

const PATHS = ["/admin/time-off/holidays", "/admin/time-off", "/time-off", "/dashboard"];

// Function declarations, not const arrows: TypeScript only narrows control flow after a
// `never`-returning call when the callee is declared this way, and these are what let the
// guards below read as `if (bad) fail(...)` without an else on every branch.
function back(q: string): never {
  redirect(`/admin/time-off/holidays?${q}`);
}

/**
 * Return to the screen keeping the fetched suggestion list on show.
 *
 * Verifying or moving a holiday used to drop the `suggestions` param, so a fetch was thrown
 * away every time HR acted on one row — they had to fetch the year again to carry on. These
 * actions are also SILENT on success: the row's own chip and dates already say what happened,
 * so a green banner is just noise. Failures still speak up.
 */
function backKeepingFetch(formData: FormData, extra = ""): never {
  const params = new URLSearchParams();
  const year = ((formData.get("year") as string) ?? "").trim();
  const suggestions = ((formData.get("suggestions") as string) ?? "").trim();
  if (year) params.set("year", year);
  if (suggestions) params.set("suggestions", suggestions);
  const q = params.toString();
  back([q, extra].filter(Boolean).join("&"));
}
function ok(msg: string): never {
  back("ok=" + encodeURIComponent(msg));
}
function fail(msg: string): never {
  back("error=" + encodeURIComponent(msg));
}

/** Normalise any parsed day to UTC midnight — the storage shape (see lib/workdays). */
function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers like 32/01 → 01/02: the constructed date must read back the same.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** dd/mm/yyyy (house standard) or yyyy-mm-dd (date inputs); null if neither. */
function parseDay(value: string): Date | null {
  const dmy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return utcDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * The holiday whose ACTUAL range overlaps [start, end], if any — the non-overlap guard
 * (FR-003). Two entries covering one day would double-describe the same day off and make
 * "which holiday is this?" unanswerable in an announcement.
 */
async function findOverlap(start: Date, end: Date, exceptId?: string) {
  return prisma.publicHoliday.findFirst({
    where: {
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
      actualStart: { lte: end },
      actualEnd: { gte: start },
    },
    select: { id: true, name: true, actualStart: true, actualEnd: true },
  });
}

/** Read a start/end pair from the form; end defaults to start (a one-day holiday). */
function readRange(formData: FormData): { start: Date; end: Date } | null {
  const start = parseDay((formData.get("start") as string) ?? "");
  if (!start) return null;
  const rawEnd = ((formData.get("end") as string) ?? "").trim();
  const end = rawEnd ? parseDay(rawEnd) : start;
  if (!end || end.getTime() < start.getTime()) return null;
  return { start, end };
}

/**
 * Tell anyone whose booked time off just became an official holiday (FR-017).
 *
 * Their taken count fixes itself — counting is always live — but they were never told, and a
 * returned day is worth knowing about. Fire-and-forget, after the write, so a mail failure
 * cannot undo the move. Only days that are newly holidays are considered, so a move that
 * merely shifts within the same days emails nobody.
 */
async function notifyDaysReturned(newlyHoliday: string[], holidayName: string): Promise<void> {
  if (newlyHoliday.length === 0) return;
  const days = newlyHoliday.map((iso) => new Date(iso + "T00:00:00Z")).sort((a, b) => a.getTime() - b.getTime());
  const first = days[0];
  const last = days[days.length - 1];
  const affected = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: last },
      endDate: { gte: first },
    },
    include: { user: { select: { name: true, email: true } } },
  });
  for (const req of affected) {
    // Only if one of the newly-holiday days actually falls inside their range.
    const covered = newlyHoliday.filter((iso) => {
      const d = new Date(iso + "T00:00:00Z").getTime();
      return d >= req.startDate.getTime() && d <= req.endDate.getTime();
    });
    if (covered.length === 0) continue;
    await sendEmail({
      to: req.user.email,
      ...holidayDayReturned({
        employeeName: req.user.name,
        holidayName,
        days: covered.map((iso) => formatDate(new Date(iso + "T00:00:00Z"))),
      }),
    });
  }
}

/**
 * Fetch a year's holidays from the online source and hand them back as SUGGESTIONS.
 *
 * Nothing is written. The result travels back through the URL because the screen is a server
 * component — the suggestions are small (a dozen rows) and this keeps the page the single
 * source of truth rather than introducing client state that could drift from the log.
 */
export async function fetchHolidayYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = Number(((formData.get("year") as string) ?? "").trim());
  const result = await fetchHolidaySuggestions(year);
  if (!result.ok) fail(result.error);
  const payload = encodeURIComponent(JSON.stringify(result.suggestions));
  back(`year=${year}&suggestions=${payload}`);
}

/**
 * Store the suggestions HR ticked. Fetched entries land TENTATIVE — the source predicts
 * moon-dependent dates, and the verification window is what settles them (FR-005).
 */
export async function confirmSuggestions(formData: FormData): Promise<void> {
  await requireAdmin();
  const picked = formData.getAll("pick").map(String).filter(Boolean);
  if (picked.length === 0) fail("Tick at least one holiday to confirm.");

  let added = 0;
  const skipped: string[] = [];
  for (const raw of picked) {
    // Each value is "startISO|endISO|name|localName" — assembled by the page from one fetch.
    const [startISO, endISO, name, localName] = raw.split("|");
    const start = parseDay(startISO ?? "");
    const end = parseDay(endISO ?? "");
    if (!start || !end || !name) {
      skipped.push(name || "an entry");
      continue;
    }
    const clash = await findOverlap(start, end);
    if (clash) {
      skipped.push(`${name} (overlaps ${clash.name})`);
      continue;
    }
    await prisma.publicHoliday.create({
      data: {
        name,
        localName: localName || null,
        originalStart: start,
        originalEnd: end,
        actualStart: start,
        actualEnd: end,
        status: "TENTATIVE",
        source: "FETCHED",
      },
    });
    added += 1;
  }
  PATHS.forEach((p) => revalidatePath(p));
  if (skipped.length) {
    fail(`Confirmed ${added}. Skipped: ${skipped.join("; ")}.`);
  }
  backKeepingFetch(
    formData,
    "ok=" + encodeURIComponent(`Confirmed ${added} holiday${added === 1 ? "" : "s"} — they need verifying nearer the date.`)
  );
}

/** Add a holiday by hand. Typed deliberately, so it starts VERIFIED (FR-005). */
export async function addHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = ((formData.get("name") as string) ?? "").trim();
  const range = readRange(formData);
  if (!range) fail("Enter a valid first day, and a last day on or after it.");
  if (!name) fail("Give the holiday a name.");

  const clash = await findOverlap(range!.start, range!.end);
  if (clash) {
    fail(
      `Those dates overlap ${clash.name} (${formatDate(clash.actualStart)}` +
        `${clash.actualEnd.getTime() !== clash.actualStart.getTime() ? ` → ${formatDate(clash.actualEnd)}` : ""}). ` +
        `Move or remove that one first.`
    );
  }
  await prisma.publicHoliday.create({
    data: {
      name,
      originalStart: range!.start,
      originalEnd: range!.end,
      actualStart: range!.start,
      actualEnd: range!.end,
      status: "VERIFIED",
      source: "MANUAL",
      verifiedAt: new Date(),
    },
  });
  PATHS.forEach((p) => revalidatePath(p));
  ok("Holiday added.");
}

/**
 * Move a holiday to the days it will actually be observed. The ANNOUNCED range is never
 * touched — that history is what lets the screen show "announced 13/04, observed 14/04".
 */
export async function moveHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = ((formData.get("id") as string) ?? "").trim();
  const range = readRange(formData);
  if (!id) return;
  if (!range) fail("Enter a valid first day, and a last day on or after it.");

  const holiday = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!holiday) fail("That holiday no longer exists.");

  const wasPast = holiday!.actualEnd.getTime() < todayUtc().getTime();
  if (wasPast && !formData.get("confirmPast")) {
    fail(
      "That holiday has already passed — changing it changes how many days off everyone is " +
        "recorded as having taken. Tick the confirmation to go ahead."
    );
  }

  const clash = await findOverlap(range!.start, range!.end, id);
  if (clash) {
    fail(
      `Those dates overlap ${clash.name} (${formatDate(clash.actualStart)}). ` +
        `Two holidays can't cover the same day — move or remove that one first.`
    );
  }

  // Days that are holidays now but weren't before — the only ones that free up booked leave.
  const wasHoliday = new Set(expandRange(holiday!.actualStart, holiday!.actualEnd));
  const newlyHoliday = expandRange(range!.start, range!.end).filter((d) => !wasHoliday.has(d));

  await prisma.publicHoliday.update({
    where: { id },
    data: {
      actualStart: range!.start,
      actualEnd: range!.end,
      status: "MOVED",
      verifiedAt: new Date(),
      // The date is settled, so this occurrence stops being chased for verification.
      reminderSentAt: holiday!.reminderSentAt ?? new Date(),
    },
  });

  PATHS.forEach((p) => revalidatePath(p));
  await notifyDaysReturned(newlyHoliday, holiday!.name);
  backKeepingFetch(formData);
}

/** Confirm a tentative holiday's date without changing it. */
export async function verifyHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = ((formData.get("id") as string) ?? "").trim();
  if (!id) return;
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!holiday) return;
  await prisma.publicHoliday.update({
    where: { id },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
      reminderSentAt: holiday.reminderSentAt ?? new Date(),
    },
  });
  PATHS.forEach((p) => revalidatePath(p));
  backKeepingFetch(formData);
}

export async function removeHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = ((formData.get("id") as string) ?? "").trim();
  if (!id) return;
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!holiday) return;
  if (holiday.actualEnd.getTime() < todayUtc().getTime() && !formData.get("confirmPast")) {
    fail(
      "That holiday has already passed — removing it changes past working-day counts. " +
        "Tick the confirmation to go ahead."
    );
  }
  await prisma.publicHoliday.delete({ where: { id } }).catch(() => {});
  PATHS.forEach((p) => revalidatePath(p));
  backKeepingFetch(formData);
}

/**
 * Bulk import from the Excel template (spec 035, made range-aware by spec 037): first sheet,
 * header row then one holiday per row — First day | Last day | Name. Date cells may be real
 * Excel dates or dd/mm/yyyy text (house standard). A holiday already starting on that day is
 * updated; new ones are created. Bad and overlapping rows are counted and reported, never
 * silently dropped.
 */
export async function uploadHolidays(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fail("Choose the filled-in Excel file first.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await (file as File).arrayBuffer());
  } catch {
    fail("That file isn't a readable Excel workbook (.xlsx).");
  }
  const ws = wb.worksheets[0];
  if (!ws) fail("The workbook has no sheets.");

  const cellDate = (raw: unknown): Date | null => {
    if (raw instanceof Date) {
      return utcDay(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
    }
    return raw == null ? null : parseDay(String(raw));
  };

  let added = 0;
  let updated = 0;
  const badRows: number[] = [];
  for (let n = 2; n <= ws!.rowCount; n++) {
    const row = ws!.getRow(n);
    const start = cellDate(row.getCell(1).value);
    const endCell = row.getCell(2).value;
    const rawName = row.getCell(3).value;
    const name = (typeof rawName === "string" ? rawName : rawName?.toString() ?? "").trim();
    if (start == null && !name) continue; // blank row — fine
    const end = endCell == null ? start : cellDate(endCell);
    if (!start || !end || !name || end.getTime() < start.getTime()) {
      badRows.push(n);
      continue;
    }
    const existing = await prisma.publicHoliday.findFirst({ where: { actualStart: start } });
    if (existing) {
      const clash = await findOverlap(start, end, existing.id);
      if (clash) {
        badRows.push(n);
        continue;
      }
      await prisma.publicHoliday.update({
        where: { id: existing.id },
        data: { name, actualEnd: end },
      });
      updated += 1;
    } else {
      if (await findOverlap(start, end)) {
        badRows.push(n);
        continue;
      }
      await prisma.publicHoliday.create({
        data: {
          name,
          originalStart: start,
          originalEnd: end,
          actualStart: start,
          actualEnd: end,
          status: "VERIFIED",
          source: "MANUAL",
          verifiedAt: new Date(),
        },
      });
      added += 1;
    }
  }

  PATHS.forEach((p) => revalidatePath(p));
  const summary = `Imported ${added} new, ${updated} existing${
    badRows.length
      ? ` · ${badRows.length} row(s) skipped (bad dates, missing name, or overlapping another holiday): ${badRows
          .slice(0, 6)
          .join(", ")}${badRows.length > 6 ? "…" : ""}`
      : ""
  }`;
  if (badRows.length) fail(summary);
  ok(summary);
}

/** Which script(s) to send. Anything unrecognised falls back to English only. */
function readLanguage(formData: FormData): AnnouncementLanguage {
  const raw = ((formData.get("language") as string) ?? "").trim();
  return raw === "ar" || raw === "both" ? raw : "en";
}

/**
 * Send ONE copy to a single address so HR can read the real thing before the team does.
 *
 * Deliberately writes NO announcement record and touches no state: a test is a rehearsal,
 * not a send, and must not make the holiday look announced or trip the "already announced"
 * guard. It also ignores the audience choice — a test goes exactly where HR typed.
 */
export async function sendTestAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = ((formData.get("id") as string) ?? "").trim();
  const to = ((formData.get("testTo") as string) ?? "").trim();
  if (!id) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) fail("Enter a valid email address to send the test to.");

  const holiday = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!holiday) fail("That holiday no longer exists.");

  const subject = ((formData.get("subject") as string) ?? "").trim();
  const bodyEn = ((formData.get("bodyEn") as string) ?? "").trim();
  const bodyAr = ((formData.get("bodyAr") as string) ?? "").trim();
  const language = readLanguage(formData);
  if (!subject) fail("Give the announcement a subject before testing it.");

  const draft = buildAnnouncementDraft(holiday!, await getHolidaySet());
  const rendered = renderHolidayAnnouncement({
    subject: `[TEST] ${subject}`,
    bodyEn,
    bodyAr,
    language,
    suggested: draft.suggested,
  });
  const reached = await sendBulkEmail({ to: [to], subject: rendered.subject, html: rendered.html });

  PATHS.forEach((p) => revalidatePath(p));
  if (reached > 0) ok(`Test sent to ${to} — nothing was recorded and nobody else got it.`);
  fail(`Nothing was sent to ${to}. Email is off or not configured — check Admin → Notifications.`);
}

/**
 * Send the announcement HR reviewed (spec 037, FR-010).
 *
 * Only a date-confirmed holiday may be announced — telling the whole company a date that is
 * still a prediction is worse than telling them nothing. The record is written BEFORE the
 * send and carries the text exactly as HR approved it plus a snapshot of the dates, which is
 * what later flags "announced with an outdated date" if the holiday moves.
 *
 * The send itself is fire-and-forget and bulk: a mail failure never rolls back the record,
 * and a company with no email configured still gets the dashboard banner.
 */
export async function sendAnnouncement(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = ((formData.get("id") as string) ?? "").trim();
  if (!id) return;

  const holiday = await prisma.publicHoliday.findUnique({
    where: { id },
    include: { announcements: { orderBy: { sentAt: "desc" }, take: 1 } },
  });
  if (!holiday) fail("That holiday no longer exists.");
  if (holiday!.status === "TENTATIVE") {
    fail("Verify the date first — the team shouldn't be told a date that might still move.");
  }

  const subject = ((formData.get("subject") as string) ?? "").trim();
  const bodyEn = ((formData.get("bodyEn") as string) ?? "").trim();
  const bodyAr = ((formData.get("bodyAr") as string) ?? "").trim();
  const language = readLanguage(formData);
  if (!subject) fail("Give the announcement a subject.");
  if ((language === "en" || language === "both") && !bodyEn) fail("The English message is empty.");
  if ((language === "ar" || language === "both") && !bodyAr) fail("The Arabic message is empty.");

  // Re-sending at dates already announced needs an explicit second click (FR-010).
  const last = holiday!.announcements[0];
  const sameDates =
    !!last &&
    last.announcedStart.getTime() === holiday!.actualStart.getTime() &&
    last.announcedEnd.getTime() === holiday!.actualEnd.getTime();
  if (sameDates && !formData.get("resendConfirmed")) {
    fail(
      `${holiday!.name} was already announced on ${formatDate(last!.sentAt)}. ` +
        `Sending again reaches everyone a second time — confirm to go ahead.`
    );
  }
  // A holiday whose dates changed since its last send is a CORRECTION, not a fresh notice.
  const isCorrection = !!last && !sameDates;

  const holidaySet = await getHolidaySet();
  const draft = buildAnnouncementDraft(holiday!, holidaySet, { isCorrection });

  // Everyone, or just the people HR ticked.
  const picked = formData.getAll("recipient").map(String).filter(Boolean);
  const toSelected = formData.get("audience") === "selected";
  if (toSelected && picked.length === 0) {
    fail("Tick at least one person, or switch back to sending to everyone.");
  }
  const recipients = await prisma.user.findMany({
    where: { status: "ACTIVE", ...(toSelected ? { id: { in: picked } } : {}) },
    select: { email: true },
  });

  const rendered = renderHolidayAnnouncement({
    subject,
    bodyEn,
    bodyAr,
    language,
    suggested: draft.suggested,
  });

  // Record first: what went out is the record, and a mail failure must not erase it.
  const sent = await prisma.holidayAnnouncement.create({
    data: {
      holidayId: holiday!.id,
      kind: isCorrection ? "CORRECTION" : "ORIGINAL",
      subject,
      bodyEn,
      bodyAr,
      announcedStart: holiday!.actualStart,
      announcedEnd: holiday!.actualEnd,
      bridgeDates: draft.bridgeISO.length ? draft.bridgeISO.join(",") : null,
      sentById: admin.id,
      recipientCount: 0,
    },
  });

  const reached = await sendBulkEmail({
    to: recipients.map((r) => r.email),
    subject: rendered.subject,
    html: rendered.html,
  });
  await prisma.holidayAnnouncement
    .update({ where: { id: sent.id }, data: { recipientCount: reached } })
    .catch(() => {});

  PATHS.forEach((p) => revalidatePath(p));
  ok(
    reached > 0
      ? `${isCorrection ? "Correction" : "Announcement"} sent to ${reached} ${reached === 1 ? "person" : "people"}${toSelected ? " (the people you picked)" : ""}.`
      : `${isCorrection ? "Correction" : "Announcement"} recorded, and the dashboard banner is live. ` +
        `No email went out — check email settings if you expected it to.`
  );
}
