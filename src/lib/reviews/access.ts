// Who may read what, in the reviews & 1:1s module (spec 039).
//
// This is the ONE place these questions are answered. Pages, actions and routes
// ask it; none of them re-derive an answer of their own.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS MODULE DOES NOT USE `requireUser()`
//
// `requireUser()` in `src/lib/roles.ts` deliberately returns the IMPERSONATION
// TARGET when a Super User is "viewing as" an employee. Its own comment says why:
// honoring impersonation at that one point makes the whole app render and act as
// the target, which is exactly right for every other module.
//
// It is exactly wrong here. A Super User could switch into an employee and read
// that person's private journal — the one thing spec 039 promises nobody can
// read — and both halves of any review they are party to. Nothing in the spec's
// wording would be violated by the code; the hole is that "the current user"
// silently means someone else.
//
// So this module resolves the REAL session user and refuses to operate at all
// while impersonating. Refusing beats silently un-impersonating: a Super User
// viewing as someone else who lands on Reviews should be told the module is
// excluded, not quietly shown their own reviews under another identity.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSuperUser } from "@/lib/roles";
import { readImpersonationCookie } from "@/lib/impersonation";
import type { Prisma } from "@prisma/client";

export type RealUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: Parameters<typeof isSuperUser>[0];
};

/** Thrown-shaped result for actions; pages use `requireRealUser`. */
export type AccessRefusal = { ok: false; error: string };

export const IMPERSONATION_REFUSAL =
  "Reviews and 1:1s are closed while you are viewing as someone else. " +
  "They are private to the two people in the conversation, so this module never " +
  "opens through impersonation. Stop viewing as to use your own.";

/**
 * The module's single entry point.
 *
 * Returns the REAL signed-in user — never an impersonation target. Redirects to
 * sign-in when there is no session, and to the module's refusal page when a
 * Super User is currently impersonating.
 */
export async function requireRealUser(): Promise<RealUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const real = session.user;

  if (await isImpersonating(real)) redirect("/reviews/unavailable");

  return real;
}

/**
 * The action-side twin of `requireRealUser` — returns a refusal instead of
 * redirecting, so a server action can surface it in the form's error slot.
 */
export async function realUserForAction(): Promise<
  { ok: true; user: RealUser } | AccessRefusal
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Please sign in again." };
  const real = session.user;
  if (await isImpersonating(real)) return { ok: false, error: IMPERSONATION_REFUSAL };
  return { ok: true, user: real };
}

/** Whether this request is a Super User currently viewing as someone else. */
export async function isImpersonating(user: { id: string; role?: RealUser["role"] }) {
  if (!isSuperUser(user.role)) return false;
  const targetId = await readImpersonationCookie();
  return Boolean(targetId && targetId !== user.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// The pair
//
// Access is authorised against the pair STORED on the record, never against
// `User.reportsToId` as it stands today. This is the deliberate opposite of the
// Time-Off rule (`pendingApprovalWhere` / `canDecideLeave` resolve approvals
// against the CURRENT org chart, on purpose): a leave request must reach whoever
// can approve it today, but a review belongs to the two people who had it. A new
// manager must never inherit the previous manager's conversations.
// ─────────────────────────────────────────────────────────────────────────────

export type Pair = { employeeId: string; managerId: string };

/** Prisma filter for the records I am personally a party to. */
export function pairWhere(meId: string): Prisma.ReviewSheetWhereInput {
  return { OR: [{ employeeId: meId }, { managerId: meId }] };
}

export function oneOnOnePairWhere(meId: string): Prisma.OneOnOneWhereInput {
  return { OR: [{ employeeId: meId }, { managerId: meId }] };
}

export function isPartyTo(pair: Pair, meId: string): boolean {
  return pair.employeeId === meId || pair.managerId === meId;
}

/** Which half of a sheet belongs to me. Null when I am not a party at all. */
export function myHalf(pair: Pair, meId: string): "employee" | "manager" | null {
  if (pair.employeeId === meId) return "employee";
  if (pair.managerId === meId) return "manager";
  return null;
}

export function counterpartId(pair: Pair, meId: string): string | null {
  if (pair.employeeId === meId) return pair.managerId;
  if (pair.managerId === meId) return pair.employeeId;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The seal
// ─────────────────────────────────────────────────────────────────────────────

export type SealState = {
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
  employeeMetConfirmedAt: Date | null;
  managerMetConfirmedAt: Date | null;
  openedAt: Date | null;
};

/**
 * Open and frozen are the SAME state, deliberately: the halves are what each
 * person brought to the meeting, and the meeting's own content belongs in the
 * outcome. Every read and write consults this one derivation rather than
 * re-testing four timestamps at each call site.
 */
export function isOpen(sheet: Pick<SealState, "openedAt">): boolean {
  return sheet.openedAt !== null;
}

/** Both halves submitted — "we are both ready to meet". Opens nothing on its own. */
export function bothSubmitted(sheet: SealState): boolean {
  return sheet.employeeSubmittedAt !== null && sheet.managerSubmittedAt !== null;
}

/**
 * Both parties confirmed the meeting happened. BOTH is the point: one party
 * confirming alone would be a way to read the other's half by declaring a
 * meeting that never took place.
 */
export function bothConfirmedMet(sheet: SealState): boolean {
  return sheet.employeeMetConfirmedAt !== null && sheet.managerMetConfirmedAt !== null;
}

/** The condition under which `openedAt` may be stamped. */
export function readyToOpen(sheet: SealState): boolean {
  return bothSubmitted(sheet) && bothConfirmedMet(sheet);
}

/** A half may be written only by its own author, and only before the sheet opens. */
export function canEditHalf(sheet: SealState & Pair, meId: string): boolean {
  return !isOpen(sheet) && myHalf(sheet, meId) !== null;
}

/**
 * What keeps a sealed half off the wire.
 *
 * Until the sheet opens, the QUERY is scoped to my own items — the other party's
 * items are never loaded, so there is nothing in the payload to hide in the
 * render. That is what makes "no preview, no summary, no word count, no
 * per-question completion state" true rather than merely invisible.
 */
export function visibleItemsWhere(
  sheet: SealState & { id: string },
  meId: string
): Prisma.ReviewSheetItemWhereInput {
  return isOpen(sheet) ? { sheetId: sheet.id } : { sheetId: sheet.id, authorId: meId };
}

/** The four-step progress the sheet header renders. */
export type SealStep = "writing" | "waiting-submit" | "waiting-met" | "open";

export function sealStep(sheet: SealState, meId: string, pair: Pair): SealStep {
  if (isOpen(sheet)) return "open";
  const half = myHalf(pair, meId);
  const mySubmitted =
    half === "employee" ? sheet.employeeSubmittedAt : sheet.managerSubmittedAt;
  if (!mySubmitted) return "writing";
  if (!bothSubmitted(sheet)) return "waiting-submit";
  return "waiting-met";
}
