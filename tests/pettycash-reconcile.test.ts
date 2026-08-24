/**
 * The petty cash reconciliation — pure, no database.
 *
 * These exist because the workbook this replaces contradicts itself. Its "Amount to reimburse"
 * line is computed as spent − float on the `March` tab (3,444.54) and as float − spent on
 * `JUL-AUG` (−4,617.16), for the same circumstance: the custodian has fronted more than the
 * float she was given. Whoever reads the two tabs cannot tell they mean the same thing.
 *
 * Every figure below is taken from the real NEW_MARCOM_Expenses.xlsx, so a failure here is
 * checkable against what Finance already knows.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  periodReconciliation,
  accountBalance,
  describeBalance,
  describeBudget,
  isOutsidePeriodWindow,
  type FundingInput,
  type LineInput,
} from "@/lib/finance/pettycash";
import { toPiastres, fromPiastres, parseAmountInput } from "@/lib/finance/money";

const egp = (n: number) => toPiastres(n);
const topUp = (n: number): FundingInput => ({ type: "TOP_UP", amountPiastres: egp(n) });
const fromFloat = (n: number): LineInput => ({ method: "FLOAT", amountPiastres: egp(n) });
const byCompany = (n: number): LineInput => ({ method: "COMPANY_TRANSFER", amountPiastres: egp(n) });

describe("the sign never inverts — the workbook's own tabs, reconciled", () => {
  test("JUL-AUG: 9,000 float against 13,617.16 spent → the company owes 4,617.16", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: null,
      fundings: [topUp(9000)],
      lines: [fromFloat(13617.16)],
    });
    assert.equal(fromPiastres(f.closingBalance), -4617.16);
    assert.equal(describeBalance(f.closingBalance, "Raneem").direction, "OWED_TO_CUSTODIAN");
  });

  test("March: 47,000 float against 50,444.54 spent → the SAME direction, not the opposite", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: null,
      fundings: [topUp(47000)],
      lines: [fromFloat(50444.54)],
    });
    assert.equal(fromPiastres(f.closingBalance), -3444.54);
    // The workbook prints this one as +3,444.54 and the previous one as −4,617.16.
    // Both mean "the company owes her". Here they agree.
    assert.equal(describeBalance(f.closingBalance, "Raneem").direction, "OWED_TO_CUSTODIAN");
  });

  test("unspent float reads the other way round, and says so in words", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: null,
      fundings: [topUp(9000)],
      lines: [fromFloat(7617.16)],
    });
    assert.equal(fromPiastres(f.closingBalance), 1382.84);
    const d = describeBalance(f.closingBalance, "Raneem");
    assert.equal(d.direction, "HELD_BY_CUSTODIAN");
    assert.match(d.sentence, /Raneem holds 1,382\.84 of company cash/);
  });

  test("exactly spent is settled, not 'owed 0'", () => {
    const f = periodReconciliation({
      openingBalance: 0, budget: null, fundings: [topUp(9000)], lines: [fromFloat(9000)],
    });
    assert.equal(f.closingBalance, 0);
    assert.equal(describeBalance(f.closingBalance, "Raneem").direction, "SETTLED");
  });
});

describe("an overspend is shown, never floored", () => {
  test("Oct-Nov: 35,000 budget against 35,229.23 spent → −229.23, stated as over budget", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: egp(35000),
      fundings: [topUp(35000)],
      lines: [fromFloat(35229.23)],
    });
    assert.equal(fromPiastres(f.budgetRemaining!), -229.23);
    assert.equal(describeBudget(f).state, "OVER");
    assert.match(describeBudget(f).sentence, /Over budget by 229\.23/);
  });

  test("the 229.23 overrun carries forward as an opening balance, not a typed-in line", () => {
    // The workbook carried this into December by hand, as a line called "December Overbudget".
    const octNov = periodReconciliation({
      openingBalance: 0, budget: egp(35000), fundings: [topUp(35000)], lines: [fromFloat(35229.23)],
    });
    const december = periodReconciliation({
      openingBalance: octNov.closingBalance, budget: null, fundings: [], lines: [],
    });
    assert.equal(fromPiastres(december.openingBalance), -229.23);
    assert.equal(fromPiastres(december.closingBalance), -229.23);
  });

  test("no budget set is 'none', not zero", () => {
    const f = periodReconciliation({ openingBalance: 0, budget: null, fundings: [], lines: [] });
    assert.equal(f.budgetRemaining, null);
    assert.equal(describeBudget(f).state, "NONE");
  });
});

describe("a company transfer is expenditure, but it is not the custodian's money", () => {
  test("it raises expenses and consumes budget while leaving the float untouched", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: egp(40000),
      fundings: [topUp(9000)],
      lines: [fromFloat(1530), byCompany(28028)], // April's Uber vs its Kamelizer venue booking
    });
    assert.equal(fromPiastres(f.spentFromFloat), 1530);
    assert.equal(fromPiastres(f.spentByCompany), 28028);
    assert.equal(fromPiastres(f.totalExpenses), 29558);
    assert.equal(fromPiastres(f.budgetRemaining!), 10442);
    // The float moved by the 1,530 only.
    assert.equal(fromPiastres(f.closingBalance), 7470);
  });
});

describe("cents survive — this is why the arithmetic is in piastres", () => {
  test("the AUG26 tab's eight lines total 9,726.26 exactly", () => {
    const lines = [1530, 3925, 482.56, 1574.8, 334.49, 457.9, 925, 496.51].map(fromFloat);
    const f = periodReconciliation({ openingBalance: 0, budget: null, fundings: [], lines });
    assert.equal(fromPiastres(f.totalExpenses), 9726.26);
    assert.equal(fromPiastres(f.closingBalance), -9726.26);
  });

  test("the three amounts that break naive float addition", () => {
    const f = periodReconciliation({
      openingBalance: 0, budget: null, fundings: [],
      lines: [fromFloat(0.1), fromFloat(0.2)],
    });
    assert.equal(fromPiastres(f.totalExpenses), 0.3); // 0.1 + 0.2 === 0.30000000000000004 in JS
  });

  test("a return of cash reduces the float advanced", () => {
    const f = periodReconciliation({
      openingBalance: 0,
      budget: null,
      fundings: [topUp(9000), { type: "RETURN", amountPiastres: egp(1000) }],
      lines: [],
    });
    assert.equal(fromPiastres(f.floatAdvanced), 8000);
    assert.equal(fromPiastres(f.closingBalance), 8000);
  });
});

describe("accountBalance agrees with the latest period's closing balance", () => {
  test("three periods of movements land on the same figure either way", () => {
    const p1 = periodReconciliation({
      openingBalance: 0, budget: null, fundings: [topUp(9000)], lines: [fromFloat(13617.16)],
    });
    const p2 = periodReconciliation({
      openingBalance: p1.closingBalance, budget: null, fundings: [topUp(20000)], lines: [fromFloat(3000)],
    });
    const p3 = periodReconciliation({
      openingBalance: p2.closingBalance, budget: null, fundings: [], lines: [fromFloat(500), byCompany(9999)],
    });

    const direct = accountBalance({
      initialOpeningBalance: 0,
      fundings: [topUp(9000), topUp(20000)],
      lines: [fromFloat(13617.16), fromFloat(3000), fromFloat(500), byCompany(9999)],
    });
    assert.equal(direct, p3.closingBalance);
    // 9,000 + 20,000 advanced, 13,617.16 + 3,000 + 500 drawn from the float.
    // The 9,999 company transfer is expenditure but NOT the custodian's money, so it is
    // absent from this figure — the mistake that is easy to make by hand, and the reason
    // both paths are asserted against each other above rather than against one literal.
    assert.equal(fromPiastres(direct), 11882.84);
  });
});

describe("amounts typed by a person", () => {
  test("accepts what people paste out of the spreadsheet", () => {
    assert.deepEqual(parseAmountInput("1,530.00"), { ok: true, piastres: 153000 });
    assert.deepEqual(parseAmountInput("EGP 482.56"), { ok: true, piastres: 48256 });
    assert.deepEqual(parseAmountInput(" 9726.26 "), { ok: true, piastres: 972626 });
  });

  test("refuses rather than rounding — a rounded amount no longer matches its receipt", () => {
    assert.equal(parseAmountInput("1530.005").ok, false);
    assert.match((parseAmountInput("1530.005") as { error: string }).error, /two decimals/);
  });

  test("refuses zero, negatives and nonsense with a sentence each", () => {
    assert.equal(parseAmountInput("0").ok, false);
    assert.equal(parseAmountInput("-50").ok, false);
    assert.equal(parseAmountInput("").ok, false);
    assert.equal(parseAmountInput("abc").ok, false);
    assert.equal(parseAmountInput("99999999.99").ok, false); // over the column's 10,2
  });
});

describe("a line dated outside its period is flagged, not refused", () => {
  const period = { startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31") };

  test("inside the window, including the last day", () => {
    assert.equal(isOutsidePeriodWindow(new Date("2026-08-31"), period), false);
    assert.equal(isOutsidePeriodWindow(new Date("2026-08-01"), period), false);
  });

  test("outside on either side", () => {
    assert.equal(isOutsidePeriodWindow(new Date("2026-07-31"), period), true);
    assert.equal(isOutsidePeriodWindow(new Date("2026-09-01"), period), true);
  });
});
