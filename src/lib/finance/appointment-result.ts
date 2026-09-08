/**
 * What an appointment action answers with (2026-09-08).
 *
 * A plain module rather than an export from `admin/confirmers/actions.ts`, because every export
 * from a `"use server"` file must be an async function — one stray value there makes Next reject
 * the whole action entry, and every action on the page then fails with a bare 500 before any of
 * them runs.
 *
 * The actions used to `redirect()` on both outcomes, which is what reloaded the entire page and
 * threw the reader back to the top. They now RETURN this instead, so the row that was clicked is
 * the only thing that changes.
 */
export type AppointmentResult = { ok: boolean; message: string };

/** The starting state of an appointment form: nothing attempted, nothing to say. */
export const NO_RESULT: AppointmentResult | null = null;
