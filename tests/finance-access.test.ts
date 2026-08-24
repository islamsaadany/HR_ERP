/**
 * Who may see and write petty cash — pure, no database.
 *
 * These are the rules a mistake in leaks another department's receipts, so they are asserted
 * rather than assumed. The point of `lib/finance/access.ts` is that the pages, the actions, the
 * sidebar door and the evidence route all ask THESE functions; a test here is a test of all four.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canManagePettyCash,
  canReviewPayback,
  canManageExpenseLists,
  canSeePettyCashAccount,
  canWritePettyCashLine,
} from "@/lib/finance/access";

const RANEEM = { id: "u_raneem" };
const MARWA = { id: "u_marwa" };
const ACCOUNT = { custodianId: "u_raneem", status: "ACTIVE" as const };

describe("who holds the module", () => {
  test("Finance and Super User manage; HR Admin and employees do not", () => {
    assert.equal(canManagePettyCash("FINANCE"), true);
    assert.equal(canManagePettyCash("SUPER_USER"), true);
    // HR is deliberately absent: this is money, and HR has no business in it.
    assert.equal(canManagePettyCash("HR_ADMIN"), false);
    assert.equal(canManagePettyCash("EMPLOYEE"), false);
    assert.equal(canManagePettyCash(undefined), false);
  });

  test("reviewing paybacks is the same set, asked separately", () => {
    assert.equal(canReviewPayback("FINANCE"), true);
    assert.equal(canReviewPayback("HR_ADMIN"), false);
  });

  test("the classification lists are governance — Super User only", () => {
    assert.equal(canManageExpenseLists("SUPER_USER"), true);
    assert.equal(canManageExpenseLists("FINANCE"), false);
  });
});

describe("seeing an account", () => {
  test("the custodian sees their own float", () => {
    assert.equal(canSeePettyCashAccount({ ...RANEEM, role: "EMPLOYEE" }, ACCOUNT), true);
  });

  test("another employee sees nothing — including another custodian", () => {
    assert.equal(canSeePettyCashAccount({ ...MARWA, role: "EMPLOYEE" }, ACCOUNT), false);
  });

  test("Finance sees every float", () => {
    assert.equal(canSeePettyCashAccount({ ...MARWA, role: "FINANCE" }, ACCOUNT), true);
  });
});

describe("writing a line", () => {
  const open = { status: "OPEN" as const };
  const submitted = { status: "SUBMITTED" as const };
  const closed = { status: "CLOSED" as const };

  test("the custodian writes while the period is open", () => {
    assert.equal(canWritePettyCashLine({ ...RANEEM, role: "EMPLOYEE" }, ACCOUNT, open), true);
  });

  test("once submitted, the custodian is read-only and Finance is not", () => {
    // A period whose author can still change it underneath the reviewer was never handed over.
    assert.equal(canWritePettyCashLine({ ...RANEEM, role: "EMPLOYEE" }, ACCOUNT, submitted), false);
    assert.equal(canWritePettyCashLine({ ...MARWA, role: "FINANCE" }, ACCOUNT, submitted), true);
  });

  test("closed means closed — for everybody, Finance included", () => {
    assert.equal(canWritePettyCashLine({ ...RANEEM, role: "EMPLOYEE" }, ACCOUNT, closed), false);
    assert.equal(canWritePettyCashLine({ ...MARWA, role: "FINANCE" }, ACCOUNT, closed), false);
    assert.equal(canWritePettyCashLine({ ...MARWA, role: "SUPER_USER" }, ACCOUNT, closed), false);
  });

  test("an unrelated employee never writes, whatever the period's state", () => {
    for (const period of [open, submitted, closed]) {
      assert.equal(canWritePettyCashLine({ ...MARWA, role: "EMPLOYEE" }, ACCOUNT, period), false);
    }
  });
});
