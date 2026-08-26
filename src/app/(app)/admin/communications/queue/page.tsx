import { requireAdmin } from "@/lib/roles";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getCommsSettings } from "@/lib/comms/settings";
import { boardRows } from "@/lib/comms/upcoming";
import { UpcomingBoard, type PeriodKey } from "@/components/comms/UpcomingBoard";

export const dynamic = "force-dynamic";

/**
 * HR's view of congratulations — due now, this month, this quarter (approved 2026-08-25).
 *
 * Still the safety net it was built as: a manager on holiday otherwise means a birthday silently
 * missed, and HR can send any of these. What is new is the look-ahead, which turns "what did we
 * forget" into something visible before it is too late to do anything about it.
 */
export default async function CommsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const admin = await requireAdmin();
  const { period: raw } = await searchParams;
  const period: PeriodKey = raw === "month" || raw === "quarter" ? raw : "due";

  const settings = await getCommsSettings();
  const rows = await boardRows(admin, period, new Date(), settings.congratsLeadDays);

  return (
    <div>
      {/* Managers send from here while this sits open. */}
      <AutoRefresh />
      <BackLink href="/admin/communications" label="Communications" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Communications</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Congratulations</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Birthdays and joining anniversaries across the company. Write them whenever you like; the
        send opens on the day, and a message that misses its day is closed rather than sent late.
      </p>

      <UpcomingBoard
        rows={rows}
        period={period}
        basePath="/admin/communications/queue"
        showAssignee
        canPreview
        emptyNote={
          period === "due"
            ? "Nothing needs sending today."
            : "Nobody has a birthday or an anniversary in this period."
        }
      />
    </div>
  );
}
