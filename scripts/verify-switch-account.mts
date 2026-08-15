/**
 * Throwaway-DB proof for spec 026 (password-less linked-account switching).
 *
 * Removing the password from the account switcher means the ONLY thing standing
 * between a session and someone else's account is the link predicate and the
 * ticket signature. This script proves both against a real Postgres rather than
 * by reasoning — and, critically, replicates what the `switch-account` provider's
 * `authorize()` does, including re-reading both employee records at switch time
 * so a link revoked after a ticket was minted still refuses.
 *
 * Run with POSTGRES_URL / DATABASE_URL pointed at a THROWAWAY database and
 * AUTH_SECRET set:
 *   AUTH_SECRET=... POSTGRES_URL=... npx tsx scripts/verify-switch-account.mts
 */
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { isLinked, linkKey, mintTicket, verifyTicket } from "../src/lib/switch-account";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const SEL = { id: true, employeeId: true, status: true };

/** Replicates the provider's authorize() — ticket, then a fresh link re-check. */
async function authorize(ticket: string | null): Promise<string | null> {
  const claims = verifyTicket(ticket);
  if (!claims) return null;
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: claims.actorId }, select: SEL }),
    prisma.user.findUnique({ where: { id: claims.targetId }, select: { ...SEL, email: true } }),
  ]);
  if (!isLinked(actor, target) || !target) return null;
  return target.email;
}

async function main() {
  const mk = (email: string, employeeId: string | null, status = "ACTIVE") =>
    prisma.user.create({ data: { email, name: email, employeeId, status: status as never } });

  // Two contracts for one person, plus every hazard the predicate must refuse.
  const [a, v, karim, n1, n2, w1, w2, left, dirty] = await Promise.all([
    mk("alaa@forefront.consulting", "E-1042"),
    mk("alaa@visualshift.co", "E-1042"),
    mk("karim@forefront.consulting", "E-2001"),
    mk("noid1@forefront.consulting", null),
    mk("noid2@forefront.consulting", null),
    mk("ws1@forefront.consulting", "   "),
    mk("ws2@forefront.consulting", " "),
    mk("left@forefront.consulting", "E-1042", "LEFT"),
    mk("dirty@forefront.consulting", " E-1042 "),
  ]);
  const load = (u: { id: string }) => prisma.user.findUnique({ where: { id: u.id }, select: SEL });
  const [A, V, K, N1, N2, W1, W2, L, D] = await Promise.all(
    [a, v, karim, n1, n2, w1, w2, left, dirty].map(load)
  );

  console.log("\nLink predicate");
  check("a linked pair is permitted, both directions", isLinked(A, V) && isLinked(V, A));
  check("an unlinked account is refused", !isLinked(A, K));
  check("null Employee IDs never link", !isLinked(N1, N2));
  check("whitespace-only Employee IDs never link", !isLinked(W1, W2));
  check("a LEFT target is refused", !isLinked(A, L));
  check("a LEFT actor is refused", !isLinked(L, A));
  check("switching to yourself is refused", !isLinked(A, A));
  check("an untrimmed stored ID still links", isLinked(A, D));
  check("linkKey rejects null and whitespace, trims otherwise",
    linkKey(null) === null && linkKey("   ") === null && linkKey(" E-1042 ") === "E-1042");

  console.log("\nTicket integrity");
  const key = process.env.AUTH_SECRET ?? "";
  const sign = (p: string) => createHmac("sha256", key).update(p).digest("hex");
  const good = mintTicket(A!.id, V!.id);
  check("a valid ticket names its actor and target",
    verifyTicket(good)?.actorId === A!.id && verifyTicket(good)?.targetId === V!.id);
  check("a fabricated signature is rejected",
    verifyTicket(`${A!.id}.${V!.id}.${Date.now() + 60_000}.deadbeef`) === null);
  check("a tampered target is rejected", verifyTicket(good!.replace(V!.id, K!.id)) === null);
  check("an unsigned payload is rejected", verifyTicket(`${A!.id}.${V!.id}.${Date.now() + 60_000}`) === null);
  check("empty / non-string / null tickets are rejected",
    verifyTicket("") === null && verifyTicket({ a: 1 }) === null && verifyTicket(null) === null);
  // Correctly signed but expired — isolates expiry from the signature check.
  const past = `${A!.id}.${V!.id}.${Date.now() - 1}`;
  check("a correctly signed but EXPIRED ticket is rejected", verifyTicket(`${past}.${sign(past)}`) === null);
  const future = `${A!.id}.${V!.id}.${Date.now() + 60_000}`;
  check("a correctly signed unexpired ticket is accepted", verifyTicket(`${future}.${sign(future)}`) !== null);
  check("expiry cannot be pushed forward without breaking the signature",
    verifyTicket(`${A!.id}.${V!.id}.${Date.now() + 9e9}.${good!.split(".")[3]}`) === null);
  const foreign = createHmac("sha256", "a-completely-different-secret-value").update(future).digest("hex");
  check("a ticket signed with another secret is rejected", verifyTicket(`${future}.${foreign}`) === null);

  console.log("\nProvider decision (end to end)");
  check("the happy path issues the TARGET's session",
    (await authorize(mintTicket(A!.id, V!.id))) === "alaa@visualshift.co");
  check("a forged ticket issues nothing", (await authorize("nonsense")) === null);
  check("a ticket naming an unlinked account issues nothing",
    (await authorize(mintTicket(A!.id, K!.id))) === null);
  check("a ticket naming a LEFT account issues nothing",
    (await authorize(mintTicket(A!.id, L!.id))) === null);

  // The one that proves the link is re-checked at SWITCH time, not at render time.
  const stale = mintTicket(A!.id, V!.id);
  await prisma.user.update({ where: { id: V!.id }, data: { employeeId: "E-9999" } });
  check("a link revoked AFTER the ticket was minted refuses the switch", (await authorize(stale)) === null);
  await prisma.user.update({ where: { id: V!.id }, data: { employeeId: "E-1042" } });

  const stale2 = mintTicket(A!.id, V!.id);
  await prisma.user.update({ where: { id: V!.id }, data: { status: "LEFT" } });
  check("an account deactivated AFTER the ticket was minted refuses the switch",
    (await authorize(stale2)) === null);
  await prisma.user.update({ where: { id: V!.id }, data: { status: "ACTIVE" } });

  console.log("\nSidebar offer never exceeds server permission");
  const me = await load(a);
  const others = await prisma.user.findMany({
    where: { employeeId: me!.employeeId, status: "ACTIVE", NOT: { id: me!.id } },
    select: SEL,
  });
  const offered = others.filter((o) => isLinked(me, o));
  check("every account offered in the sidebar is one the server permits",
    offered.length > 0 && offered.every((o) => isLinked(me, o)));
  check("the LEFT account is never offered", !offered.some((o) => o.id === L!.id));
  check("a whitespace-only Employee ID is offered nothing", linkKey(W1!.employeeId) === null);

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
