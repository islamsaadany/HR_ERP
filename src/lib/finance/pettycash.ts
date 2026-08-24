/**
 * THE petty cash derivation (spec 039).
 *
 * Every screen, every server action and every future export reads its figures from here, so
 * two surfaces can never quote totals that disagree — which is exactly what the workbook this
 * replaces does. Its `March` tab computes "Amount to reimburse" as spent − float (3,444.54
 * owed to the custodian) while `JUL-AUG` computes float − spent (−4,617.16) for the same
 * situation, so the same circumstance reads with opposite signs depending on which tab you
 * open. One derivation, one sign convention, one sentence.
 *
 * PURE ON PURPOSE: no Prisma, no `await`, no I/O. The caller loads the rows; this file does
 * the arithmetic. That is what makes it testable without a database and impossible to fork.
 *
 * EVERYTHING IS IN PIASTRES (integers, via `./money`). Never pass EGP numbers in here.
 *
 * SIGN CONVENTION — the whole point:
 *   closingBalance > 0  the custodian is holding company cash
 *   closingBalance < 0  the company owes the custodian (they have fronted their own money)
 *   closingBalance = 0  settled
 * A negative figure is NEVER floored to zero. The overdraft is the number Finance needs.
 */

export type FundingType = "TOP_UP" | "RETURN";
export type PaymentMethod = "FLOAT" | "COMPANY_TRANSFER";

/** A funding movement, reduced to what the arithmetic needs. */
export type FundingInput = {
  type: FundingType;
  /** Always positive; the type carries the direction. */
  amountPiastres: number;
};

/** A spend line, reduced to what the arithmetic needs. */
export type LineInput = {
  method: PaymentMethod;
  amountPiastres: number;
};

export type PeriodFigures = {
  /** Carried in from the previous period's closing balance. Signed. */
  openingBalance: number;
  /** Top-ups minus returns in this period. */
  floatAdvanced: number;
  /** Spend that drew on the custodian's cash. */
  spentFromFloat: number;
  /** Spend the company paid a vendor directly — real expenditure, but not the custodian's. */
  spentByCompany: number;
  /** Everything spent in the period, whoever paid it. */
  totalExpenses: number;
  /** The period's budget, or null when none was set. */
  budget: number | null;
  /** budget − totalExpenses. SIGNED: negative is an overspend, never clamped to zero. */
  budgetRemaining: number | null;
  /** opening + floatAdvanced − spentFromFloat. SIGNED. */
  closingBalance: number;
};

export type PeriodInput = {
  openingBalance: number;
  budget: number | null;
  fundings: FundingInput[];
  lines: LineInput[];
};

/**
 * The period's figures. This is the only place the reconciliation arithmetic exists.
 *
 * Note what a COMPANY_TRANSFER line does and does not do: it counts as expenditure and
 * consumes budget (the company really did spend it) but it never moves the float, because the
 * custodian's cash was not involved. The workbook's `April` tab mixes both freely — Kamelizer
 * venue bookings paid by transfer sitting beside Uber receipts paid out of pocket — and its
 * "Total Pitty Cash" line is the one that separates them.
 */
export function periodReconciliation(input: PeriodInput): PeriodFigures {
  let topUps = 0;
  let returns = 0;
  for (const f of input.fundings) {
    if (f.type === "TOP_UP") topUps += f.amountPiastres;
    else returns += f.amountPiastres;
  }
  const floatAdvanced = topUps - returns;

  let spentFromFloat = 0;
  let spentByCompany = 0;
  for (const l of input.lines) {
    if (l.method === "FLOAT") spentFromFloat += l.amountPiastres;
    else spentByCompany += l.amountPiastres;
  }
  const totalExpenses = spentFromFloat + spentByCompany;

  return {
    openingBalance: input.openingBalance,
    floatAdvanced,
    spentFromFloat,
    spentByCompany,
    totalExpenses,
    budget: input.budget,
    budgetRemaining: input.budget === null ? null : input.budget - totalExpenses,
    closingBalance: input.openingBalance + floatAdvanced - spentFromFloat,
  };
}

/**
 * An account's balance right now, across every period since it opened.
 *
 * `initialOpeningBalance` is the opening balance of the account's FIRST period — normally 0,
 * non-zero only when the company started using the platform mid-stream and carried a figure in
 * by hand. Do not pass the latest period's opening balance: openings are themselves derived
 * from prior closings, so that would count the same movements twice.
 *
 * By construction this equals the latest period's `closingBalance`; both are computed the same
 * way from the same rows, which is the point.
 */
export function accountBalance(args: {
  initialOpeningBalance: number;
  fundings: FundingInput[];
  lines: LineInput[];
}): number {
  const { closingBalance } = periodReconciliation({
    openingBalance: args.initialOpeningBalance,
    budget: null,
    fundings: args.fundings,
    lines: args.lines,
  });
  return closingBalance;
}

export type BalanceDescription = {
  direction: "OWED_TO_CUSTODIAN" | "HELD_BY_CUSTODIAN" | "SETTLED";
  /** Always positive — the magnitude. The direction is carried by `direction`/`sentence`. */
  magnitudePiastres: number;
  /** The sentence every screen prints. Built here so it can never invert between screens. */
  sentence: string;
};

/**
 * Say in words who owes whom, so nobody has to interpret a minus sign.
 *
 * `formatMoney` is injected rather than imported so this file stays free of display concerns
 * and the caller can pass `formatEGP2`. Default is a plain two-decimal rendering.
 */
export function describeBalance(
  closingBalancePiastres: number,
  custodianName: string | null,
  companyName = "Forefront",
  formatMoney: (egp: number) => string = (egp) =>
    egp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
): BalanceDescription {
  const magnitudePiastres = Math.abs(closingBalancePiastres);
  const money = formatMoney(magnitudePiastres / 100);
  const who = custodianName?.trim() || "the custodian";

  if (closingBalancePiastres < 0) {
    return {
      direction: "OWED_TO_CUSTODIAN",
      magnitudePiastres,
      sentence: `${companyName} owes ${who} ${money}`,
    };
  }
  if (closingBalancePiastres > 0) {
    return {
      direction: "HELD_BY_CUSTODIAN",
      magnitudePiastres,
      sentence: `${who} holds ${money} of company cash`,
    };
  }
  return {
    direction: "SETTLED",
    magnitudePiastres: 0,
    sentence: "Settled — nothing owed either way",
  };
}

export type BudgetDescription = {
  state: "UNDER" | "OVER" | "EXACT" | "NONE";
  magnitudePiastres: number;
  sentence: string;
};

/**
 * The same treatment for the budget. An overspend is stated as an overspend — the workbook
 * carried its 229.23 overrun into the next month as a hand-typed line called "December
 * Overbudget", which is what happens when a figure has nowhere honest to go.
 */
export function describeBudget(
  figures: Pick<PeriodFigures, "budget" | "budgetRemaining">,
  formatMoney: (egp: number) => string = (egp) =>
    egp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
): BudgetDescription {
  if (figures.budget === null || figures.budgetRemaining === null) {
    return { state: "NONE", magnitudePiastres: 0, sentence: "No budget set for this period" };
  }
  const remaining = figures.budgetRemaining;
  const money = formatMoney(Math.abs(remaining) / 100);
  if (remaining < 0) {
    return { state: "OVER", magnitudePiastres: Math.abs(remaining), sentence: `Over budget by ${money}` };
  }
  if (remaining > 0) {
    return { state: "UNDER", magnitudePiastres: remaining, sentence: `${money} left of budget` };
  }
  return { state: "EXACT", magnitudePiastres: 0, sentence: "Exactly on budget" };
}

/**
 * Whether a line's payment date falls inside its period's window. Lines outside are ACCEPTED
 * and flagged, never refused: receipts surface late, and the workbook is full of lines dated
 * outside the tab they sit on. The flag is for Finance to move it if they want to, not a rule.
 */
export function isOutsidePeriodWindow(
  datePaid: Date,
  period: { startDate: Date; endDate: Date },
): boolean {
  const d = datePaid.getTime();
  // Compare against the end of the closing day so a line paid on the last day is inside.
  const end = new Date(period.endDate);
  end.setHours(23, 59, 59, 999);
  return d < period.startDate.getTime() || d > end.getTime();
}
