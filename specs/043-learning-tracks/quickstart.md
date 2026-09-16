# Quickstart — proving Learning Tracks works (spec 043)

Two things are required before handover, neither optional: a verification script against a real
Postgres, and driving the real app in a real browser. The module's recent history is the argument —
the course-reordering work that preceded this had four faults that `tsc` and `next build` both passed
happily, and every one was found by opening a browser.

---

## Set up a throwaway database the way a deploy does

```bash
export DB="postgresql://postgres@127.0.0.1:5433/hrerp_tracks"
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx prisma db push --skip-generate --accept-data-loss
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB node scripts/apply-sql.mjs      # ← the step that gets missed
```

`db push` builds tables and nothing else; the reference data several scripts read arrives in the
numbered SQL files. Replaying the whole history onto an already-current schema makes four historical
files fail (`023`, `025`, `030`, `055`) — an artefact of replaying out of order, not a problem.

Then confirm `078` is idempotent, which is the only way to know it is:

```bash
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB node scripts/apply-sql.mjs      # second run: no-op
```

And watch a **replay against a database that already has tracks and a sent reminder in it** — a
migration is idempotent when a second run has been watched, not when it says so at the top.

---

## The verification script

```bash
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB AUTH_SECRET=anything \
  npx tsx scripts/verify-course-tracks.mts
```

It must namespace everything it writes (`vct-` ids, its own email domain, its own track names) and
must never assert a number about the whole database — the verify scripts share one.

What it has to prove, in order of how much it would hurt to get wrong:

**The fifth route**
- A person on a track holds its courses; the route is reported as `TRACK`.
- Every one of the three entry points agrees for the same person and course — `courseAccessFor`,
  `accessibleCoursesFor`, `courseRoster`. A disagreement here is the whole feature broken.
- A DRAFT or HIDDEN course on a track reaches nobody.
- Revoking the track removes the course — **unless** they had started it, in which case
  `IN_PROGRESS` keeps it and `grandfatheredOnly` is true.
- A course held by both a track and an audience rule survives losing either one.

**Deadlines**
- `resolveDeadline` returns the same date for the same step and join date, every time.
- A period and a fixed date on the same step is refused (and the check constraint refuses it too,
  tested by attempting the insert directly).
- A course in two tracks with different deadlines takes the earlier, **after** both are resolved —
  including the case where one is a period and the other a date.
- Overdue is derived: completing the course makes it not-overdue with nothing written.

**The reminder bound**
- Five sends over the schedule, then silence — a sixth day produces nothing.
- The same day twice produces one row and one email.
- A failed send writes no log row (so it is retried), and does not stop the sweep.
- Either switch off ⇒ nothing sent, nothing written.
- `LearningSettings` has no cadence column. Assert it, so nobody adds one later.

**Authority**
- A manager may add for a direct report and not for anybody else, resolved against the org chart
  as it is now — move the report and the old manager loses the ability mid-test.
- A manager cannot reach a company step by any action.
- `setRemindersEnabled(false)` by a learning manager succeeds; `(true)` by the same person is refused
  and succeeds for an HR Admin.

---

## Driving it in a real browser

Seed a realistic set, run `next start` against the throwaway database, and walk it:

1. **Build and assign.** Create a track, add three published courses, order them, assign to a person
   who held none. Sign in as that person: the three appear, in order, named as the track.
2. **A phone.** 390px — the track builder and the employee's list, no sideways scroll, nothing
   unreachable. The sidebar hides below `md`, so check what a thumb can actually reach.
3. **Deadlines.** Set one of each kind. Confirm both print dd/mm/yyyy and that the date the employee
   sees is the date the reminder uses.
4. **The chase.** Put a deadline in the past, hit the cron route with the right bearer token, and
   read the employee's inbox. Hit it again the same day: nothing. Complete the course, run again:
   nothing.
5. **The switch.** Turn reminders off as a learning manager — the run sends nothing, and the overdue
   state is still on every screen. Try to turn it back on as the same person: refused. As an HR
   admin: allowed.
6. **The manager.** As a manager, add a course for a report and reorder. Try to remove a company
   requirement: refused, with the reason on the row. Then submit the same change around the screen
   and confirm the server refuses it too.
7. **The console.** Nothing thrown, on any of the above.

---

## Before handover

```bash
npx tsc --noEmit
npm run build
```

Both clean. Then state what was verified and how — and say plainly which parts could not be checked
from here (the live Neon database, and real mail delivery through Resend), rather than presenting
them as done.
