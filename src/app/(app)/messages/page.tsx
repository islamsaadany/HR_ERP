import { requireUser } from "@/lib/roles";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getCommsSettings } from "@/lib/comms/settings";
import { boardRows } from "@/lib/comms/upcoming";
import { UpcomingBoard, type PeriodKey } from "@/components/comms/UpcomingBoard";

export const dynamic = "force-dynamic";

/**
 * A manager's own congratulations — due now, this month, this quarter (approved 2026-08-25).
 *
 * Scoped by `boardRows` to the people who report to whoever is asking, which is the same set whose
 * dates they can already read on the team screens: the look-ahead opens nothing to anybody who
 * could not already see it. No `requireAdmin`, deliberately — the whole point is that an ordinary
 * employee who happens to manage somebody can reach their own.
 *
 * And no module gate. Communications is deliberately NOT in `MODULES`: a listed module gets a nav
 * entry for everybody, and this page is meant to appear only for the person who has something to
 * do. The release switch that matters is the master email toggle at Admin → Notifications.
 */
export default async function MyMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const me = await requireUser();
  const { period: raw } = await searchParams;
  const period: PeriodKey = raw === "month" || raw === "quarter" ? raw : "due";

  const settings = await getCommsSettings();
  const rows = await boardRows(me, period, new Date(), settings.congratsLeadDays);

  return (
    <div>
      {/* HR can send one of these from their queue while this sits open. */}
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Your team</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Messages to send</h1>
      <p className="mt-1 max-w-[64ch] text-muted">
        Birthdays and joining anniversaries in your team. Written for you already &mdash; read them,
        change anything that doesn&rsquo;t sound like you, and send on the day. Nothing goes out on
        its own.
      </p>

      <UpcomingBoard
        rows={rows}
        period={period}
        basePath="/messages"
        showAssignee={false}
        canPreview={false}
        emptyNote={
          period === "due"
            ? "Nothing waiting today."
            : "Nobody in your team has a birthday or an anniversary in this period."
        }
      />
    </div>
  );
}
