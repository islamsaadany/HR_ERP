"use client";

import { useEffect } from "react";
import { markLeaveDecisionsSeen } from "@/app/(app)/time-off/actions";
import { TIMEOFF_REFRESH_EVENT } from "@/components/TimeOffBadgeSync";

/**
 * Two fire-and-forget jobs for the Time-Off page; renders nothing.
 *
 * 1. When the employee views a decision they hadn't seen, mark it seen so the nav badge
 *    stops counting it (FR-014).
 * 2. Nudge the badge to re-check whenever this page's request state changes (`signature`),
 *    which is every submit, approve, decline and cancel — the server action revalidates the
 *    page, so a new signature arrives with the re-render. Without this the sidebar kept the
 *    old number for up to 45s while the page below already showed the truth (reported
 *    2026-08-19). Marking-as-seen nudges it too: it clears the count in the database, and
 *    nothing else would have told the badge.
 */
export function MarkLeaveSeen({
  hasUnseen,
  signature,
}: {
  hasUnseen: boolean;
  /** Changes whenever the page's requests/approvals change — the cue to re-check the badge. */
  signature?: string;
}) {
  useEffect(() => {
    if (!hasUnseen) return;
    void markLeaveDecisionsSeen().then(() => {
      window.dispatchEvent(new Event(TIMEOFF_REFRESH_EVENT));
    });
  }, [hasUnseen]);

  useEffect(() => {
    window.dispatchEvent(new Event(TIMEOFF_REFRESH_EVENT));
  }, [signature]);

  return null;
}
