"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { sendBatch } from "@/lib/email/client";
import { renderMessage } from "@/lib/comms/render";
import { groupName } from "@/lib/comms/settings";

/**
 * Communication setup (spec 039 US3).
 *
 * Small, and it exists to prevent the failure that costs the most credibility: a first broadcast
 * that looks wrong, or that silently reaches nobody because a domain was never verified.
 */

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const clean = (v: FormDataEntryValue | null | undefined) =>
  typeof v === "string" ? v.trim() : "";

function revalidate() {
  revalidatePath("/admin/communications/settings");
  revalidatePath("/admin/notifications");
}

/**
 * The display name every email is sent under.
 *
 * THIS ALSO RE-BRANDS THE TWO EXISTING WORKFLOWS. There is one display name for everything the
 * platform sends, so a benefit-claim notification will arrive under this name too. That is the
 * intended outcome — one voice — but the screen says so out loud, because a setting that quietly
 * changes something else is how trust in a settings page goes.
 */
export async function setDisplayName(formData: FormData): Promise<Result> {
  await requireAdmin();
  const name = clean(formData.get("fromName"));
  if (name.length > 80) return { ok: false, error: "That name is too long (80 characters max)." };
  // A name with a quote or an angle bracket breaks the `Name <address>` header it is spliced into.
  if (/["<>\r\n]/.test(name)) {
    return { ok: false, error: "A sender name can't contain quotes, angle brackets or line breaks." };
  }

  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", fromName: name || null },
    update: { fromName: name || null },
  });
  revalidate();
  return { ok: true, message: name ? `Emails will arrive from “${name}”.` : "Sender name cleared." };
}

export async function setCongratsLeadDays(formData: FormData): Promise<Result> {
  await requireAdmin();
  const raw = clean(formData.get("congratsLeadDays"));
  const days = Number.parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 0 || days > 30) {
    return { ok: false, error: "Choose between 0 and 30 days." };
  }
  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", congratsLeadDays: days },
    update: { congratsLeadDays: days },
  });
  revalidate();
  return {
    ok: true,
    message:
      days === 0
        ? "Drafts will be prepared on the day itself."
        : `Drafts will be prepared ${days} ${days === 1 ? "day" : "days"} ahead.`,
  };
}

/**
 * Send a test to YOURSELF.
 *
 * Takes no recipient parameter — deliberately. An action that accepted an address would be a way
 * for anyone who can reach this endpoint to mail an arbitrary person from the company's domain.
 * The only address it can ever use is the one on the acting user's own record.
 *
 * Rendered through `renderMessage`, the same builder every real send calls, so what arrives is the
 * real thing rather than a sample that resembles it.
 */
export async function sendTestToSelf(): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.email) return { ok: false, error: "Your record has no email address." };

  const [me, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: admin.id },
      select: {
        name: true,
        email: true,
        businessUnit: { select: { name: true, primaryColor: true } },
      },
    }),
    groupName(),
  ]);
  if (!me?.email) return { ok: false, error: "Your record has no email address." };

  const { html, text } = renderMessage({
    unit: me.businessUnit,
    groupName: group,
    fallbackLabel: "Announcement",
    subject: "This is what your emails will look like",
    body:
      "This is a test, sent from the platform so you can see the design, the sender name and the address it arrives from — before anybody else receives one.\n\n" +
      "The band across the top carries your business unit's name and its own colour, with the group above it. The message itself is always plain dark text on white, whatever the unit.\n\n" +
      "If this looks right, it is ready to use.",
    cta: null,
    preheader: "A test from the platform. Nobody else received this.",
  });

  const [result] = await sendBatch([
    { to: me.email, subject: "Test — this is what your emails will look like", html, text, ref: "test" },
  ]);

  if (!result) return { ok: false, error: "Nothing was sent." };
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Sent to ${me.email}. If it does not arrive, check your spam folder before changing anything.` };
}
