"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { AUDIENCE_FIELDS, type AudienceChoice, type AudienceField } from "@/lib/audience/types";
import { reachedUserIds } from "@/lib/audience/reach";
import { brandForRecipients, getCommsSettings, groupName } from "@/lib/comms/settings";
import { renderMessage } from "@/lib/comms/render";
import { sendBatch } from "@/lib/email/client";

/**
 * Announcements (spec 039 US1).
 *
 * TWO RULES HOLD THIS FILE TOGETHER, both structural rather than remembered:
 *
 *  1. Every export begins with a guard, and NOTHING is exported that is not called. Spec 038
 *     shipped four unused exports from a file like this one — each of them a live POST endpoint
 *     nothing called — and one query with no guard at all.
 *  2. No action takes an actor id as a parameter. Who is acting is only ever what the resolver
 *     returns, so a new action cannot be written that skips the check.
 *
 * And one that is specific to this feature: SENDING CANNOT BE UNDONE. `sendAnnouncement` is the
 * only irreversible thing in the platform that a person triggers deliberately, so it carries four
 * guards rather than one, and each of them refuses rather than clamps.
 */

export type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** HR Admin or Super User. Announcements go to the whole company; this is not a manager's power. */
async function requireCommsSender() {
  return requireAdmin();
}

const clean = (v: FormDataEntryValue | null | undefined) =>
  typeof v === "string" ? v.trim() : "";

function revalidate(id?: string) {
  revalidatePath("/admin/communications");
  if (id) revalidatePath(`/admin/communications/${id}`);
}

// ─── Compose ────────────────────────────────────────────────────────────

/**
 * Start a draft.
 *
 * Subject and body may be EMPTY here — a new announcement opens as a blank page with grey
 * prompts, not with placeholder words already typed into it that the operator has to select and
 * delete first. They are still required to SEND: `sendAnnouncement` refuses an empty message, and
 * `updateAnnouncement` refuses to save one blank once something has been written.
 */
export async function createAnnouncement(formData: FormData): Promise<Result<{ id: string }>> {
  const admin = await requireCommsSender();
  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));

  if (subject.length > 200) return { ok: false, error: "That subject is too long (200 characters max)." };

  const message = await prisma.message.create({
    data: { kind: "ANNOUNCEMENT", state: "DRAFT", subject, body, createdById: admin.id },
    select: { id: true },
  });
  revalidate(message.id);
  return { ok: true, data: { id: message.id } };
}

export async function updateAnnouncement(id: string, formData: FormData): Promise<Result> {
  await requireCommsSender();
  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));
  const ctaLabel = clean(formData.get("ctaLabel"));
  const ctaHref = clean(formData.get("ctaHref"));

  if (!subject) return { ok: false, error: "Give the announcement a subject." };
  if (!body) return { ok: false, error: "Write something to send." };
  if (ctaHref && !/^https?:\/\//i.test(ctaHref)) {
    // Refused rather than silently dropped at render: an operator who typed a link deserves to
    // know it will not appear, not to discover it missing from an email already sent.
    return { ok: false, error: "A link must start with http:// or https:// — a relative link is dead in an email." };
  }
  if (ctaHref && !ctaLabel) return { ok: false, error: "Give the link a label." };

  const existing = await prisma.message.findUnique({ where: { id }, select: { state: true } });
  if (!existing) return { ok: false, error: "That message no longer exists." };
  // A sent message is a RECORD. Editing one would rewrite history that people have in their inbox.
  if (existing.state !== "DRAFT") return { ok: false, error: "This has already been sent, so it can't be edited." };

  await prisma.message.update({
    where: { id },
    data: { subject, body, ctaLabel: ctaLabel || null, ctaHref: ctaHref || null },
  });
  revalidate(id);
  return { ok: true };
}

// ─── Audience ───────────────────────────────────────────────────────────

/**
 * Add several choices to one field at once.
 *
 * Deliberately NOT all-or-nothing: each choice stands alone, so a stale name in a list of eight
 * must not throw the other seven away. Every fault is reported together, so the operator fixes
 * them in one pass rather than one refusal at a time.
 */
export async function setAnnouncementAudience(
  id: string,
  field: AudienceField,
  values: string[]
): Promise<Result> {
  await requireCommsSender();
  if (!AUDIENCE_FIELDS.includes(field)) return { ok: false, error: "Unknown field." };

  const message = await prisma.message.findUnique({ where: { id }, select: { state: true } });
  if (!message) return { ok: false, error: "That message no longer exists." };
  if (message.state !== "DRAFT") return { ok: false, error: "This has already been sent." };

  const wanted = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const faults: string[] = [];
  for (const value of wanted) {
    const problem = await validateChoice(field, value);
    if (problem) {
      faults.push(problem);
      continue;
    }
    // Idempotent: choosing the same thing twice is a no-op, not a duplicate row.
    await prisma.messageAudience.upsert({
      where: { messageId_field_value: { messageId: id, field, value } },
      create: { messageId: id, field, value },
      update: {},
    });
  }

  revalidate(id);
  return faults.length > 0 ? { ok: false, error: faults.join(" ") } : { ok: true };
}

async function validateChoice(field: AudienceField, value: string): Promise<string | null> {
  switch (field) {
    case "DEPARTMENT": {
      const n = await prisma.department.count({ where: { name: value } });
      return n > 0 ? null : `There is no department called "${value}".`;
    }
    case "BUSINESS_UNIT": {
      const n = await prisma.businessUnit.count({ where: { id: value } });
      return n > 0 ? null : "One of those business units no longer exists.";
    }
    case "EMPLOYMENT_TYPE":
      return value === "FULL_TIME" || value === "PART_TIME" ? null : "Pick full-time or part-time.";
    case "TENURE_BAND":
      return ["BAND_6MO_2Y", "BAND_2_4Y", "BAND_4_7Y", "BAND_7_10Y"].includes(value)
        ? null
        : "Pick a tenure band.";
    case "REPORTS_TO": {
      const n = await prisma.user.count({ where: { id: value, status: "ACTIVE" } });
      return n > 0 ? null : "That manager isn't an active employee.";
    }
    case "GROUP": {
      const n = await prisma.learnerGroup.count({ where: { id: value } });
      return n > 0 ? null : "One of those groups no longer exists.";
    }
    case "PERSON": {
      const person = await prisma.user.findUnique({
        where: { id: value },
        select: { status: true, name: true },
      });
      if (!person) return "One of those employees no longer exists.";
      return person.status === "ACTIVE" ? null : `${person.name} has left.`;
    }
  }
}

export async function removeAudienceChoice(id: string, rowId: string): Promise<Result> {
  await requireCommsSender();
  await prisma.messageAudience.deleteMany({ where: { id: rowId, messageId: id } });
  revalidate(id);
  return { ok: true };
}

// ─── Send ───────────────────────────────────────────────────────────────

/**
 * Send an announcement. THE irreversible action.
 *
 * Four guards, in order, each refusing rather than proceeding on a guess:
 *
 *  1. DRAFT, re-read INSIDE the transaction. Two people pressing send and the second is told it
 *     has already gone — the disabled button is a courtesy, this is what actually holds.
 *  2. `confirmedCount` must still equal what the server counts NOW. If somebody joined the
 *     department between the dialog and the click, the send is refused and the operator
 *     re-confirms against the real number. A confirmation that can silently cover more people than
 *     it named is not a confirmation.
 *  3. An empty audience is refused with the reason — never a cheerful "sent to 0 people".
 *  4. Email off or unconfigured is refused plainly, never silently swallowed. This is the one
 *     place the fire-and-forget stance of the transactional emails would be wrong: an operator who
 *     pressed send has to know whether it went.
 *
 * A PARTIAL FAILURE IS STILL A SEND. The message is not rolled back when some deliveries fail,
 * because the people who received it did receive it — and a row saying FAILED for the rest is the
 * only way anybody finds out who to chase.
 */
export async function sendAnnouncement(
  id: string,
  confirmedCount: number
): Promise<Result<{ sent: number; failed: number }>> {
  const admin = await requireCommsSender();

  const settings = await getCommsSettings();
  if (!settings.emailEnabled) {
    return { ok: false, error: "Email sending is switched off in Notification settings, so nothing was sent." };
  }

  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      id: true,
      state: true,
      kind: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaHref: true,
      audiences: { select: { field: true, value: true } },
    },
  });
  if (!message) return { ok: false, error: "That message no longer exists." };
  if (message.state !== "DRAFT") return { ok: false, error: "This has already been sent." };
  if (message.audiences.length === 0) {
    return { ok: false, error: "Nobody is selected yet, so there is nothing to send." };
  }

  const choices: AudienceChoice[] = message.audiences.map((a) => ({
    field: a.field as AudienceField,
    value: a.value,
  }));
  const userIds = await reachedUserIds(choices);
  if (userIds.length === 0) {
    return {
      ok: false,
      error: "The people you chose reach nobody active right now, so nothing was sent.",
    };
  }
  if (userIds.length !== confirmedCount) {
    return {
      ok: false,
      error: `This now reaches ${userIds.length} ${userIds.length === 1 ? "person" : "people"}, not ${confirmedCount}. Check who it is going to and confirm again.`,
    };
  }

  const [recipients, group] = await Promise.all([brandForRecipients(userIds), groupName()]);

  // Claim the send BEFORE dispatching anything. Two operators pressing at once, and only one gets
  // past this update — the other's `count` is 0 and it stops here rather than sending twice.
  const claimed = await prisma.message.updateMany({
    where: { id, state: "DRAFT" },
    data: { state: "SENT", sentById: admin.id, sentAt: new Date(), recipientCount: recipients.length },
  });
  if (claimed.count === 0) return { ok: false, error: "This has already been sent." };

  await prisma.messageRecipient.createMany({
    data: recipients.map((r) => ({
      messageId: id,
      userId: r.userId,
      email: r.email,
      businessUnitId: r.unit?.id ?? null,
      state: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.messageRecipient.findMany({
    where: { messageId: id },
    select: { id: true, userId: true },
  });
  const rowByUser = new Map(rows.map((r) => [r.userId, r.id]));

  const results = await sendBatch(
    recipients.map((r) => {
      const { html, text } = renderMessage({
        unit: r.unit ? { name: r.unit.name, primaryColor: r.unit.primaryColor } : null,
        groupName: group,
        fallbackLabel: "Announcement",
        subject: message.subject,
        body: message.body,
        cta: message.ctaLabel && message.ctaHref ? { label: message.ctaLabel, href: message.ctaHref } : null,
      });
      return { to: r.email, subject: message.subject, html, text, ref: rowByUser.get(r.userId) ?? r.userId };
    })
  );

  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      sent += 1;
      await prisma.messageRecipient.updateMany({
        where: { id: result.ref },
        data: { state: "ACCEPTED", providerId: result.providerId },
      });
    } else {
      failed += 1;
      await prisma.messageRecipient.updateMany({
        where: { id: result.ref },
        data: { state: "FAILED", error: result.error.slice(0, 500) },
      });
    }
  }

  revalidate(id);
  return { ok: true, data: { sent, failed } };
}

export async function deleteDraft(id: string): Promise<Result> {
  await requireCommsSender();
  const message = await prisma.message.findUnique({ where: { id }, select: { state: true } });
  if (!message) return { ok: false, error: "That message no longer exists." };
  if (message.state !== "DRAFT") return { ok: false, error: "A sent message is a record and can't be deleted." };
  await prisma.message.delete({ where: { id } });
  revalidate();
  return { ok: true };
}

// ─── Congratulations (spec 039 US2) ─────────────────────────────────────
//
// Different guards from an announcement, because a congratulation is different in three ways: it
// goes to ONE person, it is sent by their MANAGER rather than HR, and it has a DAY it is for.

import { isAdmin, requireUser } from "@/lib/roles";
import { assigneeFor, canActOn, draftFor } from "@/lib/comms/drafts";
import { hasPassed, occasionsInWindow } from "@/lib/comms/occasions";
import { sendWindow } from "@/lib/comms/upcoming";
import { formatDate } from "@/lib/labels";

/** HR, or the person the draft is assigned to. Returns the actor — never takes an id. */
async function requireAssignee(messageId: string) {
  const user = await requireUser();
  const allowed = await canActOn(user, messageId);
  if (!allowed) return null;
  return user;
}

export async function updateCongratulation(id: string, formData: FormData): Promise<Result> {
  const actor = await requireAssignee(id);
  if (!actor) return { ok: false, error: "This isn't yours to send." };

  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));
  if (!subject) return { ok: false, error: "Give it a subject." };
  if (!body) return { ok: false, error: "Write something to send." };

  const message = await prisma.message.findUnique({ where: { id }, select: { state: true } });
  if (!message) return { ok: false, error: "That message no longer exists." };
  if (message.state === "SENT") return { ok: false, error: "This has already been sent." };
  if (message.state === "MISSED") return { ok: false, error: "The day has passed, so this is closed." };

  await prisma.message.update({ where: { id }, data: { subject, body } });
  revalidatePath("/messages");
  revalidatePath("/admin/communications/queue");
  return { ok: true };
}

/**
 * Send one congratulation.
 *
 * Four guards, and the third is the one that only exists here: a message for a day that has gone
 * is REFUSED, not sent. You cannot wish somebody a happy birthday three days afterwards, and a
 * platform that tries is worse than one that stays quiet.
 */
/**
 * Write a congratulation now, for an occasion the platform has not prepared yet.
 *
 * The look-ahead is derived from people's dates, so most of what it lists has no draft behind it.
 * This makes one on demand — the point of the whole change: a manager writes when they have the
 * time, rather than in the three days before the day.
 *
 * Idempotent by CONSTRAINT, not by checking first. `Occasion` is unique on
 * (userId, kind, occasionYear), so two managers pressing this at once produce one occasion and one
 * draft; the loser reads the winner's row rather than creating a second.
 *
 * It does NOT bring the send forward. `sendCongratulation` refuses until the day arrives.
 */
export async function writeCongratulation(
  userId: string,
  kind: "BIRTHDAY" | "WORK_ANNIVERSARY",
  occasionYear: number
): Promise<Result<{ id: string }>> {
  const actor = await requireUser();

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, status: true, dateOfBirth: true, startDate: true, reportsToId: true },
  });
  if (!person) return { ok: false, error: "That person is no longer on the system." };
  if (person.status !== "ACTIVE") return { ok: false, error: `${person.name} has left.` };

  // Who may write one: HR for anybody, a manager for their own reports. The same rule the
  // look-ahead uses to decide what to show, asked again at the write — a list is not a permission.
  const mayWrite = isAdmin(actor.role) || person.reportsToId === actor.id;
  if (!mayWrite) return { ok: false, error: "This isn't yours to write." };

  // Recomputed here rather than taken from the caller. A date arriving in a form argument is a
  // date somebody can change; the occasion has to be the one the person's record actually implies.
  const [occasion] = occasionsInWindow(
    [{ id: person.id, name: person.name ?? "Someone", status: person.status, dateOfBirth: person.dateOfBirth, startDate: person.startDate }],
    new Date(Date.UTC(occasionYear, 0, 1)),
    new Date(Date.UTC(occasionYear, 11, 31))
  ).filter((o) => o.kind === kind);
  if (!occasion) return { ok: false, error: "There is no such occasion on that person's record." };

  const existing = await prisma.occasion.findUnique({
    where: { userId_kind_occasionYear: { userId, kind, occasionYear } },
    select: { messageId: true },
  });
  if (existing?.messageId) {
    revalidate(existing.messageId);
    return { ok: true, data: { id: existing.messageId } };
  }

  const assignedToId = (await assigneeFor(userId)) ?? actor.id;
  const { subject, body } = draftFor(occasion);

  try {
    // Message first, then the Occasion pointing at it — the same order `prepareOccasions` uses,
    // because the foreign key lives on Occasion. One transaction, so a failure leaves neither.
    const id = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { kind, state: "DRAFT", subject, body, subjectUserId: userId, assignedToId },
        select: { id: true },
      });
      await tx.occasion.create({
        data: {
          userId,
          kind,
          occasionYear,
          occasionDate: occasion.occasionDate,
          years: occasion.years ?? null,
          messageId: message.id,
        },
      });
      return message.id;
    });
    revalidate(id);
    return { ok: true, data: { id } };
  } catch {
    // Lost the race against another writer — the unique index refused it. Their row is the answer.
    const now = await prisma.occasion.findUnique({
      where: { userId_kind_occasionYear: { userId, kind, occasionYear } },
      select: { messageId: true },
    });
    if (now?.messageId) return { ok: true, data: { id: now.messageId } };
    return { ok: false, error: "That couldn't be written just now." };
  }
}

export async function sendCongratulation(id: string): Promise<Result> {
  const actor = await requireAssignee(id);
  if (!actor) return { ok: false, error: "This isn't yours to send." };

  const settings = await getCommsSettings();
  if (!settings.emailEnabled) {
    return { ok: false, error: "Email sending is switched off in Notification settings, so nothing was sent." };
  }

  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      state: true,
      subject: true,
      body: true,
      subjectUserId: true,
      occasion: { select: { occasionDate: true } },
      subjectUser: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          businessUnit: { select: { id: true, name: true, primaryColor: true } },
        },
      },
    },
  });
  if (!message) return { ok: false, error: "That message no longer exists." };
  if (message.state === "SENT") return { ok: false, error: "This has already been sent." };
  if (message.state === "MISSED") return { ok: false, error: "The day has passed, so this is closed." };

  const person = message.subjectUser;
  if (!person) return { ok: false, error: "The person this was for is no longer on the system." };
  // A leaver receives nothing. Checked at SEND, not only at preparation — three days is long
  // enough for somebody to leave.
  if (person.status !== "ACTIVE") {
    return { ok: false, error: `${person.name} has left, so this can't be sent.` };
  }
  if (!person.email) return { ok: false, error: `${person.name} has no email address on record.` };

  if (message.occasion && hasPassed(message.occasion.occasionDate, new Date())) {
    return {
      ok: false,
      error: "That day has passed. A late birthday message reads worse than none, so this one is closed.",
    };
  }

  // ...and the same argument pointed the other way. Since drafts can be written months ahead, the
  // send button now sits there for weeks before it should be pressed, and a birthday message three
  // weeks early is worse than one that is late. Enforced here rather than only disabled on screen:
  // the button is a courtesy, this is the rule.
  if (message.occasion) {
    const window = sendWindow(message.occasion.occasionDate, new Date(), settings.congratsLeadDays);
    if (!window.open && !window.past) {
      return {
        ok: false,
        error: `Too early — this one opens on ${formatDate(window.opensOn)}. Sending it now would arrive weeks before the day.`,
      };
    }
  }

  // Claim it before sending. Two people looking at the same queue, and only one gets past here.
  const claimed = await prisma.message.updateMany({
    where: { id, state: "DRAFT" },
    data: { state: "SENT", sentById: actor.id, sentAt: new Date(), recipientCount: 1 },
  });
  if (claimed.count === 0) return { ok: false, error: "This has already been sent." };

  const group = await groupName();
  const { html, text } = renderMessage({
    unit: person.businessUnit
      ? { name: person.businessUnit.name, primaryColor: person.businessUnit.primaryColor }
      : null,
    groupName: group,
    fallbackLabel: "A note for you",
    subject: message.subject,
    body: message.body,
    cta: null,
    // Signed with whoever actually pressed send — honest only because they rewrote the words first.
    signedBy: actor.name ?? null,
    preheader: message.subject,
  });

  const recipient = await prisma.messageRecipient.create({
    data: {
      messageId: id,
      userId: person.id,
      email: person.email,
      businessUnitId: person.businessUnit?.id ?? null,
      state: "PENDING",
    },
    select: { id: true },
  });

  const [result] = await sendBatch([
    { to: person.email, subject: message.subject, html, text, ref: recipient.id },
  ]);

  if (result?.ok) {
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { state: "ACCEPTED", providerId: result.providerId },
    });
  } else {
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { state: "FAILED", error: (result?.error ?? "Send failed.").slice(0, 500) },
    });
  }

  revalidatePath("/messages");
  revalidatePath("/admin/communications/queue");
  return result?.ok
    ? { ok: true }
    : { ok: false, error: result?.error ?? "The message could not be delivered." };
}

/**
 * Close a draft without sending it.
 *
 * A manager needs a way to say "not this one" that is not silence — somebody on compassionate
 * leave, or a person who has asked not to be marked. Recorded as MISSED with the reason, so the
 * queue shows a decision rather than a gap.
 */
export async function dismissCongratulation(id: string, reason?: string): Promise<Result> {
  const actor = await requireAssignee(id);
  if (!actor) return { ok: false, error: "This isn't yours to close." };

  const closed = await prisma.message.updateMany({
    where: { id, state: "DRAFT" },
    data: {
      state: "MISSED",
      missedAt: new Date(),
      body: reason?.trim() ? `[Not sent: ${reason.trim()}]` : undefined,
    },
  });
  if (closed.count === 0) return { ok: false, error: "That draft is no longer open." };

  revalidatePath("/messages");
  revalidatePath("/admin/communications/queue");
  return { ok: true };
}
