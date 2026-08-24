import type { Role } from "@prisma/client";
import { isFinance, isSuperUser } from "@/lib/roles";

/**
 * THE access derivation for the Finance module (spec 039).
 *
 * One source, asked by the pages, the server actions, the sidebar door and the evidence
 * serving route alike. The Learning module cost us this lesson: a rule written twice is a rule
 * that eventually disagrees with itself, and the half that is wrong is the half that leaks.
 *
 * Note what is NOT here: `isAdmin`. An HR Admin has no business in petty cash or payback — this
 * is money, and money is Finance and Super User. Adding HR here later would be a decision, not
 * a convenience.
 */

/** Create accounts, name custodians, record funding, open/close/reopen periods, review paybacks. */
export const canManagePettyCash = (role?: Role): boolean => isFinance(role) || isSuperUser(role);

/** Review, approve, reject and pay payback requests. Same people; named separately so the
 *  two features can diverge later without one silently inheriting the other's rule. */
export const canReviewPayback = (role?: Role): boolean => isFinance(role) || isSuperUser(role);

/** Maintain the section and category lists. Governance, so Super User only (FR-027). */
export const canManageExpenseLists = (role?: Role): boolean => isSuperUser(role);

type AccountLike = { custodianId: string; status?: "ACTIVE" | "ARCHIVED" };
type UserLike = { id: string; role?: Role };

/**
 * May this person see this account at all? Finance and Super Users see every account; a
 * custodian sees the one they hold. Everybody else sees nothing — an ordinary employee has no
 * legitimate interest in another department's receipts.
 */
export function canSeePettyCashAccount(user: UserLike, account: AccountLike): boolean {
  if (canManagePettyCash(user.role)) return true;
  return account.custodianId === user.id;
}

type PeriodLike = { status: "OPEN" | "SUBMITTED" | "CLOSED" };

/**
 * May this person add or change a line right now?
 *
 * OPEN       — the custodian and Finance both write.
 * SUBMITTED  — the custodian has handed the period over, so only Finance writes. This is what
 *              "submitted for review" has to mean: a period whose author can still change it
 *              underneath the reviewer was never handed over at all.
 * CLOSED     — nobody. Amounts, dates, classification and method are frozen. (Evidence is a
 *              separate question, handled by the actions: a receipt arriving late changes no
 *              figure, so it may still be attached.)
 *
 * An account with no active custodian is refused separately, at the action, because the reason
 * is different and deserves its own sentence.
 */
export function canWritePettyCashLine(
  user: UserLike,
  account: AccountLike,
  period: PeriodLike,
): boolean {
  if (period.status === "CLOSED") return false;
  if (canManagePettyCash(user.role)) return true;
  if (account.custodianId !== user.id) return false;
  return period.status === "OPEN";
}
