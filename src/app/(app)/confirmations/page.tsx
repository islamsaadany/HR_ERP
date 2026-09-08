import { redirect } from "next/navigation";

/**
 * The confirmer's screen moved to a tab on Finance → Payments on 2026-09-08 (the CEO: "it can be
 * part of the payments panel as a subtab"). This address survives only because emails sent before
 * that day link here, and an email cannot be edited after it has gone.
 */
export default function ConfirmationsMoved() {
  redirect("/finance?tab=confirmations");
}
