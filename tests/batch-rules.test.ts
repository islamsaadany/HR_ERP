/**
 * Who can mark company money as released — pure, no database.
 *
 * The rule these protect is the one nobody asked for: whoever CREATED the transactions in the bank
 * may not be the one who confirms them. Two signatures is the whole point of the feature, and
 * without this a single person holding both Finance and the confirmer appointment could release
 * money alone.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  batchTotal,
  canDecide,
  nextStatus,
  releasesItems,
  describeBatch,
  nextBatchReference,
  type Viewer,
} from "@/lib/finance/batches";
import { toPiastres, fromPiastres } from "@/lib/finance/money";

const FINANCE: Viewer = { id: "u_finance", isConfirmer: false, isSuperUser: false };
const CEO: Viewer = { id: "u_ceo", isConfirmer: true, isSuperUser: false };
const BOSS: Viewer = { id: "u_boss", isConfirmer: false, isSuperUser: true };
const OPEN = { status: "SUBMITTED" as const, submittedById: "u_finance" };

describe("whoever created them in the bank may not confirm them", () => {
  test("an appointed confirmer who didn't create them: allowed", () => {
    assert.deepEqual(canDecide(OPEN, CEO), { ok: true });
  });

  test("the person who created them: refused, and told why", () => {
    const d = canDecide({ status: "SUBMITTED", submittedById: CEO.id }, CEO);
    assert.equal(d.ok, false);
    assert.match((d as { reason: string }).reason, /somebody else has to confirm them/);
  });

  test("holding BOTH Finance and the appointment is still not enough", () => {
    const both: Viewer = { id: "u_x", isConfirmer: true, isSuperUser: false };
    assert.equal(canDecide({ status: "SUBMITTED", submittedById: "u_x" }, both).ok, false);
  });

  test("top-level access is the single exception the CEO allowed", () => {
    assert.deepEqual(canDecide({ status: "SUBMITTED", submittedById: BOSS.id }, BOSS), { ok: true });
  });

  test("somebody with no appointment at all: refused", () => {
    const d = canDecide(OPEN, FINANCE);
    assert.equal(d.ok, false);
    assert.match((d as { reason: string }).reason, /aren't appointed/);
  });
});

describe("once decided, it is finished", () => {
  for (const status of ["COMPLETE", "RETURNED", "WITHDRAWN"] as const) {
    test(`${status}: no further decision, whoever asks`, () => {
      assert.equal(canDecide({ status, submittedById: "u_finance" }, CEO).ok, false);
      assert.equal(canDecide({ status, submittedById: "u_finance" }, BOSS).ok, false);
      assert.equal(nextStatus(status, "complete"), null);
    });
  }

  test("the moves allowed while it is waiting", () => {
    assert.equal(nextStatus("SUBMITTED", "complete"), "COMPLETE");
    assert.equal(nextStatus("SUBMITTED", "returnToFinance"), "RETURNED");
    assert.equal(nextStatus("SUBMITTED", "withdraw"), "WITHDRAWN");
  });
});

describe("what happens to the payables", () => {
  test("returning or withdrawing releases them; completing keeps them", () => {
    assert.equal(releasesItems("RETURNED"), true);
    assert.equal(releasesItems("WITHDRAWN"), true);
    // A completed record is the history of what actually moved.
    assert.equal(releasesItems("COMPLETE"), false);
    assert.equal(releasesItems("SUBMITTED"), false);
  });
});

describe("the total the confirmer is shown", () => {
  test("exact to the piastre across a mixed batch", () => {
    const total = batchTotal(
      [1199.5, 262.83, 9726.26].map((n) => ({ amountPiastres: toPiastres(n) })),
    );
    assert.equal(fromPiastres(total), 11188.59);
  });

  test("an empty batch totals nothing — the action refuses it separately", () => {
    assert.equal(batchTotal([]), 0);
  });
});

describe("what the email and the screen say — the same sentence, from one place", () => {
  test("expenses count transactions — and it is never called a batch on screen", () => {
    assert.equal(
      describeBatch({ type: "EXPENSES", itemCount: 3 }, "EGP 12,450.00"),
      "3 transactions totalling EGP 12,450.00",
    );
    assert.match(describeBatch({ type: "EXPENSES", itemCount: 1 }, "EGP 10.00"), /1 transaction /);
    assert.equal(/batch/i.test(describeBatch({ type: "EXPENSES", itemCount: 2 }, "EGP 1.00")), false);
  });

  test("a salary run counts PEOPLE, not transactions", () => {
    const s = describeBatch(
      { type: "SALARY", itemCount: 0, salaryMonth: new Date("2026-08-01"), headcount: 5 },
      "EGP 89,000.00",
    );
    assert.equal(s, "Salaries for August 2026 — EGP 89,000.00 covering 5 people");
  });

  test("no payee name can appear in it — there is nowhere to put one", () => {
    // The summary takes counts and a total. Names are structurally absent, which is what
    // SC-007 requires of every email this feature sends.
    const s = describeBatch({ type: "EXPENSES", itemCount: 2 }, "EGP 1.00");
    assert.equal(/[A-Z][a-z]+ [A-Z][a-z]+/.test(s), false);
  });
});

describe("references read like a bank statement", () => {
  test("month, year, sequence", () => {
    assert.equal(nextBatchReference(new Date("2026-08-24"), 1), "AUG-26-01");
    assert.equal(nextBatchReference(new Date("2026-12-02"), 12), "DEC-26-12");
  });
});
