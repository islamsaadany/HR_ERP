import { redirect } from "next/navigation";
import { requireUser, isManager } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { teamLearning } from "@/lib/learning/queries";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TeamLearning } from "@/components/learning/TeamLearning";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

/**
 * Gated on the org chart, not a role — the same "manager" capability Time-Off approvals use. Lose
 * your last direct report and this page stops being yours, with no admin action needed.
 */
export default async function TeamLearningPage() {
  await requireModuleEnabled("learning");
  const me = await requireUser();
  if (!(await isManager(me.id))) redirect("/learning");

  const team = await teamLearning(me.id);

  return (
    <div>
      <AutoRefresh />
      <BackLink href="/learning" label="My learning" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Learning</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">My team&rsquo;s training</h1>
      <TeamLearning team={team} />
    </div>
  );
}
