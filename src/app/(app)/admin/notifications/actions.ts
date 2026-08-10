"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { sendTestEmail } from "@/lib/email/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const q = (s: string) => encodeURIComponent(s);

/** Save the NotificationSettings singleton (Super User only). Secrets stay in env. */
export async function updateNotificationSettings(formData: FormData): Promise<void> {
  await requireSuperUser();

  const emailEnabled = formData.get("emailEnabled") === "on";
  const hrInbox = ((formData.get("hrInbox") as string | null) ?? "").trim();
  const financeInbox = ((formData.get("financeInbox") as string | null) ?? "").trim();
  const fromName = ((formData.get("fromName") as string | null) ?? "").trim();

  if (hrInbox && !EMAIL_RE.test(hrInbox)) {
    redirect("/admin/notifications?error=" + q("The HR inbox isn't a valid email address."));
  }
  if (financeInbox && !EMAIL_RE.test(financeInbox)) {
    redirect("/admin/notifications?error=" + q("The Finance inbox isn't a valid email address."));
  }
  // Guard: turning notifications on without the inboxes set would silently skip sends.
  if (emailEnabled && (!hrInbox || !financeInbox)) {
    redirect(
      "/admin/notifications?error=" +
        q("Set both the HR and Finance inboxes before turning notifications on.")
    );
  }

  const data = {
    emailEnabled,
    hrInbox: hrInbox || null,
    financeInbox: financeInbox || null,
    fromName: fromName || null,
  };
  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=1");
}

/** Send a test email to confirm the Resend key + sender work (Super User only). */
export async function sendTestEmailAction(formData: FormData): Promise<void> {
  await requireSuperUser();
  const to = ((formData.get("to") as string | null) ?? "").trim();
  if (!EMAIL_RE.test(to)) {
    redirect("/admin/notifications?testError=" + q("Enter a valid recipient address."));
  }
  const res = await sendTestEmail(to);
  if (res.ok) {
    redirect("/admin/notifications?testSent=" + q(to));
  }
  redirect("/admin/notifications?testError=" + q(res.error ?? "Send failed."));
}
