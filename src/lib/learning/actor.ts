import { getImpersonation, requireUser } from "@/lib/roles";

/**
 * Who is learning — the ONLY way a learning write may discover its subject (spec 038 FR-026).
 *
 * WHY THIS EXISTS RATHER THAN A CHECK IN EACH ACTION
 * `requireUser()` deliberately returns the IMPERSONATED user when a Super User is "viewing as" an
 * employee, so the whole app renders as that person. For reads that is exactly right — an admin
 * reproducing a complaint should see the employee's Learning list as they see it. For WRITES it is
 * wrong: a training record has to say what the employee actually did, and a row created by an
 * admin clicking around inside someone else's account is a falsified record (SC-009: zero progress
 * rows attributable to an impersonating admin).
 *
 * The failure mode this guards is not today's code — it is the fourteenth action someone adds in
 * six months and forgets to check. So the guard lives in the resolver, and the rule that makes it
 * stick is:
 *
 *   NO LEARNING WRITE MAY ACCEPT A USER ID AS A PARAMETER.
 *
 * The learner is only ever the value this function returns. A new action literally cannot find out
 * who is learning without passing through here, so it cannot be written without the guard.
 */

export class ImpersonationWriteRefused extends Error {
  constructor() {
    super(
      "You're viewing as another employee. Learning progress can only be recorded by the employee themselves — exit 'View as employee' first."
    );
    this.name = "ImpersonationWriteRefused";
  }
}

export type Learner = { id: string; name: string; email: string };

/**
 * Resolve the acting learner, refusing while impersonation is active.
 *
 * Throws `ImpersonationWriteRefused` rather than redirecting, so the calling action can turn it
 * into the house `ActionState` and show the toast instead of bouncing the admin out of the page
 * they were legitimately inspecting.
 */
export async function requireLearner(): Promise<Learner> {
  const user = await requireUser();
  const impersonation = await getImpersonation();
  if (impersonation.isImpersonating) throw new ImpersonationWriteRefused();
  return { id: user.id, name: user.name ?? "", email: user.email ?? "" };
}

/**
 * Whether learning writes are currently possible — for the UI to disable controls and explain why,
 * BEFORE the employee (or admin) clicks. The server still refuses regardless; this only spares
 * someone a pointless click.
 */
export async function learningWritesBlocked(): Promise<string | null> {
  const impersonation = await getImpersonation();
  return impersonation.isImpersonating
    ? `Viewing as ${impersonation.targetName ?? "an employee"} — progress can't be recorded from here.`
    : null;
}
