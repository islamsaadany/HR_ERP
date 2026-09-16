"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { refuseUnlessManages } from "@/lib/learning/manager-access";
import {
  addPersonalStep,
  removePersonalStep,
  reorderPersonalSteps,
} from "@/lib/learning/tracks";
import type { TrackResult } from "@/lib/learning/track-results";

/**
 * A manager shaping one of their own people's learning (spec 043, US3).
 *
 * Separate from `actions.ts` because the AUTHORITY is different: those actions ask "do you run
 * Learning", these ask "is this person yours, today". Keeping them in one file would mean one
 * import away from somebody guarding a manager action with the wrong check.
 *
 * Every export is an async function. The result type lives in a plain module.
 *
 * WHAT A MANAGER CANNOT DO, and why it is not a check here: a company requirement lives in
 * `LearningTrackStep`, and nothing reachable from this file writes to that table. The refusal is
 * structural. The guard below is about WHOSE learning, not WHICH course — those are different
 * questions and conflating them is how one of them ends up unenforced.
 */

const forLearner = (userId: string) => {
  revalidatePath("/learning/team");
  revalidatePath(`/learning/team/${userId}`);
  revalidatePath("/learning");
};

export async function addPersonalStepAction(
  learnerId: string,
  courseId: string
): Promise<TrackResult> {
  const actor = await requireUser();
  const refusal = await refuseUnlessManages(actor, learnerId);
  if (refusal) return { ok: false, error: refusal };

  const result = await addPersonalStep(learnerId, courseId, actor.id);
  if (result.ok) forLearner(learnerId);
  return result;
}

export async function removePersonalStepAction(
  learnerId: string,
  stepId: string
): Promise<TrackResult> {
  const actor = await requireUser();
  const refusal = await refuseUnlessManages(actor, learnerId);
  if (refusal) return { ok: false, error: refusal };

  const result = await removePersonalStep(stepId);
  if (result.ok) forLearner(learnerId);
  return result;
}

export async function reorderPersonalStepsAction(
  learnerId: string,
  stepIds: string[]
): Promise<TrackResult> {
  const actor = await requireUser();
  const refusal = await refuseUnlessManages(actor, learnerId);
  if (refusal) return { ok: false, error: refusal };

  const result = await reorderPersonalSteps(learnerId, stepIds);
  if (result.ok) forLearner(learnerId);
  return result;
}
