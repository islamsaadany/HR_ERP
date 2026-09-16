"use server";

import { revalidatePath } from "next/cache";
import { requireLearningManager } from "@/lib/learning/managers";
import {
  addStep,
  assignTrack,
  createTrack,
  deleteTrack,
  removeStep,
  reorderSteps,
  revokeTrackAssignment,
  setStepDeadline,
  updateTrack,
} from "@/lib/learning/tracks";
import { TWO_DEADLINES, type TrackResult } from "@/lib/learning/track-results";

/**
 * The door to the track writes (spec 043).
 *
 * EVERY EXPORT HERE IS AN ASYNC FUNCTION. Next validates a page's whole server-action entry the
 * first time any action on the page is called, so a single exported constant, array or type-twin
 * breaks EVERY action on the page — as a bare 500 with no message, above any code that could catch
 * it, and with nothing said by the type check or the build. The result types and the refusal
 * sentences live in `@/lib/learning/track-results`.
 *
 * Each action is the same three things and nothing else: who is asking, is the input sane, then a
 * call into `@/lib/learning/tracks` where the write actually happens. The write is a plain module
 * so the verify script can drive it without a session — and so it is not itself a URL the browser
 * can post to.
 */

function revalidate(trackId?: string) {
  revalidatePath("/admin/learning/tracks");
  if (trackId) revalidatePath(`/admin/learning/tracks/${trackId}`);
  // The employee's own list changes the moment a track does.
  revalidatePath("/learning");
}

const clean = (v: FormDataEntryValue | null | undefined) =>
  typeof v === "string" ? v.trim() : "";

export async function createTrackAction(formData: FormData): Promise<TrackResult> {
  const actor = await requireLearningManager();
  const result = await createTrack(
    clean(formData.get("name")),
    clean(formData.get("description")) || null,
    actor.id
  );
  if (result.ok) revalidate();
  return result;
}

export async function updateTrackAction(trackId: string, formData: FormData): Promise<TrackResult> {
  const actor = await requireLearningManager();
  // A field the form did not carry is left alone rather than read as cleared.
  const patch: { name?: string; description?: string | null } = {};
  if (formData.has("name")) patch.name = clean(formData.get("name"));
  if (formData.has("description")) patch.description = clean(formData.get("description")) || null;

  const result = await updateTrack(trackId, patch, actor.id);
  if (result.ok) revalidate(trackId);
  return result;
}

export async function deleteTrackAction(trackId: string): Promise<TrackResult> {
  await requireLearningManager();
  const result = await deleteTrack(trackId);
  if (result.ok) revalidate();
  return result;
}

export async function addStepAction(trackId: string, courseId: string): Promise<TrackResult> {
  await requireLearningManager();
  const result = await addStep(trackId, courseId);
  if (result.ok) revalidate(trackId);
  return result;
}

export async function removeStepAction(trackId: string, stepId: string): Promise<TrackResult> {
  await requireLearningManager();
  const result = await removeStep(stepId);
  if (result.ok) revalidate(trackId);
  return result;
}

export async function reorderStepsAction(trackId: string, stepIds: string[]): Promise<TrackResult> {
  await requireLearningManager();
  const result = await reorderSteps(trackId, stepIds);
  if (result.ok) revalidate(trackId);
  return result;
}

/**
 * `kind` arrives from the browser, so it is checked against the two real shapes rather than
 * trusted. An unrecognised value is treated as a refusal, not as "no deadline" — silently clearing
 * somebody's deadline because a form sent a word we did not expect is the worst of the options.
 */
export async function setStepDeadlineAction(
  trackId: string,
  stepId: string,
  kind: string,
  value: string
): Promise<TrackResult> {
  await requireLearningManager();

  let deadline: { dueDays: number | null; dueOn: Date | null };
  if (kind === "none") {
    deadline = { dueDays: null, dueOn: null };
  } else if (kind === "days") {
    const days = Number.parseInt(value, 10);
    if (!Number.isInteger(days)) return { ok: false, error: "Enter a whole number of days." };
    deadline = { dueDays: days, dueOn: null };
  } else if (kind === "date") {
    const on = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(on.getTime())) return { ok: false, error: "That is not a date." };
    deadline = { dueDays: null, dueOn: on };
  } else {
    return { ok: false, error: TWO_DEADLINES };
  }

  const result = await setStepDeadline(stepId, deadline);
  if (result.ok) revalidate(trackId);
  return result;
}

export async function assignTrackAction(
  trackId: string,
  subject: { userId?: string; groupId?: string }
): Promise<TrackResult> {
  const actor = await requireLearningManager();
  const result = await assignTrack(trackId, subject, actor.id);
  if (result.ok) revalidate(trackId);
  return result;
}

export async function revokeTrackAction(
  trackId: string,
  assignmentId: string
): Promise<TrackResult> {
  await requireLearningManager();
  const result = await revokeTrackAssignment(assignmentId);
  if (result.ok) revalidate(trackId);
  return result;
}
