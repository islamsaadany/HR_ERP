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

export async function createAnnouncement(formData: FormData): Promise<Result<{ id: string }>> {
  const admin = await requireCommsSender();
  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));

  if (!subject) return { ok: false, error: "Give the announcement a subject." };
  if (subject.length > 200) return { ok: false, error: "That subject is too long (200 characters max)." };
  if (!body) return { ok: false, error: "Write something to send." };

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
