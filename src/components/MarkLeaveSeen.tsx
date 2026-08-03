"use client";

import { useEffect } from "react";
import { markLeaveDecisionsSeen } from "@/app/(app)/time-off/actions";

/**
 * Fire-and-forget: when the employee views their Time-Off page, mark any
 * decided-but-unseen requests as seen so the nav badge clears (FR-014).
 * Renders nothing.
 */
export function MarkLeaveSeen({ hasUnseen }: { hasUnseen: boolean }) {
  useEffect(() => {
    if (hasUnseen) void markLeaveDecisionsSeen();
  }, [hasUnseen]);
  return null;
}
