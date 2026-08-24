"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canManagePettyCash } from "@/lib/finance/access";
import { parseAmountInput, fromPiastres } from "@/lib/finance/money";
import { withAccountLock, periodFiguresFor, linesMissingEvidence } from "@/lib/finance/queries";
import { refuse, isRefusal } from "@/lib/finance/refusal";

/**
 * Finance-only petty cash actions (spec 039): accounts, custodians, funding, and the period
 * lifecycle. Everything a custodian may do lives in `actions.ts` next door.
 *
 * House style here: a check inside a lock `refuse()`s, the caller catches it once the
 * transaction has rolled back, and the redirect happens in plain sight (see lib/finance/refusal).
 */

const q = (s: string) => encodeURIComponent(s);

/**
 * Refuse, and say why on the page the operator came from.
 *
 * A function DECLARATION with an explicit `never` return type, not an arrow in a helper object:
 * only this form takes part in TypeScript's control-flow analysis, so `if (!x) fail(...)` actually
 * narrows `x` for the rest of the action instead of leaving a trail of non-null assertions.
 */
function fail(back: string, msg: string): never {
  redirect(`${back}?error=${q(msg)}`);
}

/** Require Finance (or Super User); redirect home otherwise. Returns who is acting. */
async function requireManager(): Promise<string> {
  const user = await requireUser();
  if (!canManagePettyCash(user.role)) redirect("/dashboard");
  return user.id;
}

/** Run a locked write, turning a refusal raised inside it into the action's error redirect. */
async function guarded<T>(back: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (e) {
    if (isRefusal(e)) fail(back, e.reason);
    throw e;
  }
}

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = ((raw as string | null) ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** End of today, so a same-day entry passes but tomorrow does not. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Accounts ──────────────────────────────────────────────────────────────

export async function createAccount(formData: FormData): Promise<void> {
  const back = "/petty-cash";
  const actorId = await requireManager();

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const custodianId = ((formData.get("custodianId") as string | null) ?? "").trim();
  if (!name) fail(back, "Give the account a name.");
  if (!custodianId) fail(back, "Choose who holds this float.");

  const custodian = await prisma.user.findUnique({
    where: { id: custodianId },
    select: { id: true, status: true },
  });
  if (!custodian) fail(back, "That person isn't in the employee registry.");
  if (custodian.status !== "ACTIVE") {
    fail(back, "That person is no longer active — choose a current employee.");
  }
  if (await prisma.pettyCashAccount.findUnique({ where: { name } })) {
    fail(back, `There is already an account called "${name}".`);
  }

  const account = await prisma.pettyCashAccount.create({
    data: { name, custodianId, createdById: actorId },
  });

  revalidatePath("/petty-cash");
  redirect(`/petty-cash/${account.id}`);
}

export async function setCustodian(formData: FormData): Promise<void> {
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();

  const custodianId = ((formData.get("custodianId") as string | null) ?? "").trim();
  const custodian = await prisma.user.findUnique({
    where: { id: custodianId },
    select: { id: true, status: true, name: true },
  });
  if (!custodian) fail(back, "That person isn't in the employee registry.");
  if (custodian.status !== "ACTIVE") {
    fail(back, "That person is no longer active — choose a current employee.");
  }

  await prisma.pettyCashAccount.update({
    where: { id: accountId },
    data: { custodianId },
  });

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q(`${custodian.name ?? "They"} now holds this float.`)}`);
}

export async function archiveAccount(formData: FormData): Promise<void> {
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  await requireManager();

  const open = await prisma.pettyCashPeriod.findFirst({
    where: { accountId, status: "OPEN" },
    select: { id: true },
  });
  if (open) fail(back, "Close the open period before archiving this account.");

  await prisma.pettyCashAccount.update({
    where: { id: accountId },
    data: { status: "ARCHIVED" },
  });
  revalidatePath("/petty-cash");
  redirect("/petty-cash?ok=" + q("Account archived."));
}

// ─── Periods ───────────────────────────────────────────────────────────────

/**
 * Open a period. Its opening balance is the previous period's CLOSING balance, so the carry
 * forward is a first-class figure rather than the workbook's hand-typed "December Overbudget"
 * line. Locked, because two calls racing here would leave two open periods, after which no line
 * has an unambiguous home.
 */
export async function openPeriod(formData: FormData): Promise<void> {
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();

  const label = ((formData.get("label") as string | null) ?? "").trim();
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (!label) fail(back, "Give the period a name, for example “Aug 2026”.");
  if (!startDate || !endDate) fail(back, "Enter both a start and an end date.");
  if (endDate.getTime() < startDate.getTime()) fail(back, "The end date can't be before the start date.");

  const budgetRaw = ((formData.get("budget") as string | null) ?? "").trim();
  let budget: number | null = null;
  if (budgetRaw) {
    const parsed = parseAmountInput(budgetRaw);
    if (!parsed.ok) fail(back, parsed.error);
    budget = fromPiastres(parsed.piastres);
  }

  await guarded(back, () =>
    withAccountLock(accountId, async (tx) => {
      const existingOpen = await tx.pettyCashPeriod.findFirst({
        where: { accountId, status: "OPEN" },
        select: { label: true },
      });
      // Checked here as well as by the partial unique index, so the operator gets a sentence
      // rather than a constraint error.
      if (existingOpen) refuse(`This account already has an open period (${existingOpen.label}).`);

      const clash = await tx.pettyCashPeriod.findFirst({
        where: { accountId, label },
        select: { id: true },
      });
      if (clash) refuse(`There is already a period called "${label}".`);

      const previous = await tx.pettyCashPeriod.findFirst({
        where: { accountId },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
      const carried = previous ? ((await periodFiguresFor(previous.id, tx))?.closingBalance ?? 0) : 0;

      await tx.pettyCashPeriod.create({
        data: {
          accountId,
          label,
          startDate,
          endDate,
          budget,
          openingBalance: fromPiastres(carried),
        },
      });
    }),
  );

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q(`${label} is open.`)}`);
}

/**
 * Close a period. The figures are recomputed UNDER THE LOCK: trusting the totals the page
 * rendered a minute ago would freeze a number that is no longer true, and a line landing
 * mid-close would land in a closed period.
 */
export async function closePeriod(formData: FormData): Promise<void> {
  const periodId = ((formData.get("periodId") as string | null) ?? "").trim();
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();
  if (!periodId) fail(back, "Nothing to close.");

  const acknowledged = formData.get("acknowledgeMissing") === "yes";
  const ackNote = ((formData.get("ackNote") as string | null) ?? "").trim() || null;

  await guarded(back, () =>
    withAccountLock(accountId, async (tx) => {
      const period = await tx.pettyCashPeriod.findUnique({
        where: { id: periodId },
        select: { status: true, accountId: true },
      });
      if (!period || period.accountId !== accountId) {
        refuse("That period doesn't belong to this account.");
      }
      if (period.status === "CLOSED") refuse("That period is already closed.");

      const missing = await linesMissingEvidence(periodId, tx);
      if (missing.length > 0 && !acknowledged) {
        const n = missing.length;
        refuse(
          `${n} ${n === 1 ? "line has" : "lines have"} no receipt attached. Tick the acknowledgement to close anyway.`,
        );
      }

      const figures = await periodFiguresFor(periodId, tx);
      const closing = figures?.closingBalance ?? 0;

      await tx.pettyCashPeriod.update({
        where: { id: periodId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: actorId,
          ...(missing.length > 0
            ? {
                missingEvidenceAckAt: new Date(),
                missingEvidenceAckById: actorId,
                missingEvidenceAckNote: ackNote,
                // WHICH lines were waved through, not merely that a box was ticked — an
                // acknowledgement that doesn't say what was accepted says nothing.
                missingEvidenceAckLineIds: missing.map((l) => l.id),
              }
            : {}),
        },
      });

      // A later period may already exist (after a reopen-and-reclose); its opening balance must
      // follow this closing balance rather than keep a stale carry.
      const next = await tx.pettyCashPeriod.findFirst({
        where: { accountId, id: { not: periodId }, status: { not: "CLOSED" } },
        orderBy: [{ startDate: "asc" }],
        select: { id: true },
      });
      if (next) {
        await tx.pettyCashPeriod.update({
          where: { id: next.id },
          data: { openingBalance: fromPiastres(closing) },
        });
      }
    }),
  );

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q("Period closed.")}`);
}

/** Reopen a closed period, with a reason. Its successor's opening balance is re-derived. */
export async function reopenPeriod(formData: FormData): Promise<void> {
  const periodId = ((formData.get("periodId") as string | null) ?? "").trim();
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();

  const reason = ((formData.get("reason") as string | null) ?? "").trim();
  if (!reason) {
    fail(back, "Say why this period is being reopened — it changes figures that were signed off.");
  }

  await guarded(back, () =>
    withAccountLock(accountId, async (tx) => {
      const period = await tx.pettyCashPeriod.findUnique({
        where: { id: periodId },
        select: { status: true, accountId: true },
      });
      if (!period || period.accountId !== accountId) {
        refuse("That period doesn't belong to this account.");
      }
      if (period.status !== "CLOSED") refuse("That period isn't closed.");

      const otherOpen = await tx.pettyCashPeriod.findFirst({
        where: { accountId, status: "OPEN" },
        select: { label: true },
      });
      if (otherOpen) {
        refuse(`Close ${otherOpen.label} first — an account can only have one open period.`);
      }

      await tx.pettyCashPeriod.update({
        where: { id: periodId },
        data: {
          status: "OPEN",
          reopenedAt: new Date(),
          reopenedById: actorId,
          reopenReason: reason,
          closedAt: null,
          closedById: null,
        },
      });
    }),
  );

  revalidatePath(back);
  redirect(`${back}?ok=${q("Period reopened — its figures can change again.")}`);
}

// ─── Funding ───────────────────────────────────────────────────────────────

/**
 * Record cash moving into or out of the float. The amount is always positive; the type carries
 * the direction, so a negative number can never mean two different things.
 */
export async function recordFunding(formData: FormData): Promise<void> {
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();

  const type = (formData.get("type") as string | null) === "RETURN" ? "RETURN" : "TOP_UP";
  const parsed = parseAmountInput(formData.get("amount"));
  if (!parsed.ok) fail(back, parsed.error);

  const date = parseDate(formData.get("date"));
  if (!date) fail(back, "Enter the date the money moved.");
  if (date.getTime() > endOfToday().getTime()) fail(back, "That date is in the future.");

  const periodId = ((formData.get("periodId") as string | null) ?? "").trim() || null;
  const reference = ((formData.get("reference") as string | null) ?? "").trim() || null;
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  await guarded(back, () =>
    withAccountLock(accountId, async (tx) => {
      if (periodId) {
        const period = await tx.pettyCashPeriod.findUnique({
          where: { id: periodId },
          select: { status: true, accountId: true },
        });
        if (!period || period.accountId !== accountId) {
          refuse("That period doesn't belong to this account.");
        }
        if (period.status === "CLOSED") {
          refuse("That period is closed — reopen it to record funding against it.");
        }
      }
      await tx.pettyCashFunding.create({
        data: {
          accountId,
          periodId,
          type,
          date,
          amount: fromPiastres(parsed.piastres),
          reference,
          note,
          recordedById: actorId,
        },
      });
    }),
  );

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q(type === "TOP_UP" ? "Top-up recorded." : "Return recorded.")}`);
}

/** Remove a funding row recorded in error, while its period is still open. */
export async function deleteFunding(formData: FormData): Promise<void> {
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  const fundingId = ((formData.get("fundingId") as string | null) ?? "").trim();
  const back = `/petty-cash/${accountId}`;
  const actorId = await requireManager();

  await guarded(back, () =>
    withAccountLock(accountId, async (tx) => {
      const funding = await tx.pettyCashFunding.findUnique({
        where: { id: fundingId },
        select: { accountId: true, period: { select: { status: true } } },
      });
      if (!funding || funding.accountId !== accountId) {
        refuse("That entry doesn't belong to this account.");
      }
      if (funding.period?.status === "CLOSED") {
        refuse("That period is closed — reopen it to change this entry.");
      }
      await tx.pettyCashFunding.delete({ where: { id: fundingId } });
    }),
  );

  revalidatePath(back);
  redirect(`${back}?ok=${q("Entry removed.")}`);
}
