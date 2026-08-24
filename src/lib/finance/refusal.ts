/**
 * A refusal raised inside a locked transaction.
 *
 * The obvious thing is to call `redirect()` where the check fails — but inside a Prisma
 * interactive transaction that means throwing Next's redirect signal through the transaction
 * boundary and relying on it surviving the rollback intact. It does, today; it is also
 * invisible, and a reader has to know that to follow the code.
 *
 * So a check inside the lock throws this instead, the caller catches it after the transaction
 * has rolled back, and the redirect happens in plain sight at the top level.
 */
export class Refusal extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "Refusal";
  }
}

/** Throw a refusal. Typed `never` so TypeScript narrows correctly after a guard. */
export function refuse(reason: string): never {
  throw new Refusal(reason);
}

/** True when this is a refusal we raised, rather than a real failure worth surfacing. */
export function isRefusal(e: unknown): e is Refusal {
  return e instanceof Refusal;
}
