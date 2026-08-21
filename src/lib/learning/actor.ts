import { getImpersonation, requireUser } from "@/lib/roles";

/**
 * Who is learning — the ONLY way a learning write may discover its subject.
 *
 * `requireUser()` returns the IMPERSONATED user when a Super User is "viewing as" an employee, so
 * the whole app renders and now also ACTS as that person.
 *
 * ── ALLOW_IMPERSONATED_WRITES ──────────────────────────────────────────────────────────────────
 * This was originally a refusal (spec 038 FR-026/SC-009): a training record should say what the
 * employee actually did, and a row created by an admin clicking around inside someone else's
 * account is a falsified record. **Turned off on 2026-08-21 at the product owner's request** —
 * impersonation is how they test the module, and the refusal made that impossible.
 *
 * The consequence, stated once so it is on the record rather than discovered later: a training
 * record can now be created by a Super User acting as someone else, and nothing distinguishes it
 * from one the employee earned. If these records ever need to stand up as evidence that a person
 * was trained, flip the constant below back to `false`.
 *
 * The structural rule that made the original guard reliable is KEPT, because it costs nothing and
 * makes reinstating the refusal a one-line change:
 *
 *   NO LEARNING WRITE MAY ACCEPT A USER ID AS A PARAMETER.
 *
 * The learner is only ever the value this function returns.
 */
const ALLOW_IMPERSONATED_WRITES = true;

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
  if (!ALLOW_IMPERSONATED_WRITES) {
    const impersonation = await getImpersonation();
    if (impersonation.isImpersonating) throw new ImpersonationWriteRefused();
  }
  return { id: user.id, name: user.name ?? "", email: user.email ?? "" };
}

/**
 * Whether learning writes are currently possible — for the UI to disable controls and explain why,
 * BEFORE the employee (or admin) clicks. The server still refuses regardless; this only spares
 * someone a pointless click.
 */
export async function learningWritesBlocked(): Promise<string | null> {
  if (ALLOW_IMPERSONATED_WRITES) return null;
  const impersonation = await getImpersonation();
  return impersonation.isImpersonating
    ? `Viewing as ${impersonation.targetName ?? "an employee"} — progress can't be recorded from here.`
    : null;
}
