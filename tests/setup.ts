/**
 * Runs BEFORE any test module, so it can point the app's Prisma client at a throwaway database
 * before that client is created (`src/lib/prisma.ts` reads POSTGRES_URL at import time, and ESM
 * imports are hoisted — setting it inside a test file would be too late).
 *
 * The database tests TRUNCATE, so this file's real job is refusing to let that happen anywhere
 * near real data. It throws rather than skipping when the target looks wrong: a misconfigured
 * run must stop loudly, not quietly pass.
 */
function refuseUnlessThrowaway(u: string): string | null {
  const dbName = (u.split("?")[0].split("/").pop() ?? "").toLowerCase();
  if (!/test/.test(dbName)) return `the database name "${dbName}" does not contain "test"`;
  if (/neon\.tech/i.test(u)) return "it points at Neon, which hosts real data";
  return null;
}

const url = process.env.TEST_DATABASE_URL;
if (url) {
  const refusal = refuseUnlessThrowaway(url);
  if (refusal) {
    throw new Error(
      `Refusing to run the database tests: ${refusal}.\n` +
        `These tests TRUNCATE every table. Point TEST_DATABASE_URL at a disposable database ` +
        `whose name contains "test".`
    );
  }
  // The app's client and the tests must share one connection, or each sees a different world.
  process.env.POSTGRES_URL = url;
  process.env.DATABASE_URL_UNPOOLED = url;
  process.env.POOL_TESTS_READY = "1";
}
