# Quickstart: Team Communications (spec 039)

**Date**: 2026-08-24 · **Purpose**: prove the feature works end to end, and record honestly what
cannot be proved from a development session.

---

## Prerequisites

```bash
npx tsc --noEmit          # must be clean
npm run build             # must be clean
```

A throwaway Postgres for the database-backed checks (never Neon, never anything shared):

```bash
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -1)
export PGDATA=/var/tmp/comms_pg
rm -rf "$PGDATA" && mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres"
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-k /tmp -p 5440 -c listen_addresses=' -l $PGDATA/log start"
su postgres -c "$PGBIN/createdb -h /tmp -p 5440 -U postgres comms_test"
export DB="postgresql://postgres@localhost:5440/comms_test?host=/tmp"
```

---

## Scenario 1 — the migration is safe and matches the schema

```bash
# Build the schema as it is BEFORE this feature, so 067 is exercised for real
git show HEAD:prisma/schema.prisma > /var/tmp/before.prisma
POSTGRES_URL="$DB" DATABASE_URL_UNPOOLED="$DB" \
  npx prisma db push --schema=/var/tmp/before.prisma --skip-generate --accept-data-loss

# Apply twice — idempotence is a requirement, not a hope
su postgres -c "$PGBIN/psql -h /tmp -p 5440 -U postgres -d comms_test -v ON_ERROR_STOP=1 \
  -f prisma/sql/067_team_communications.sql"
su postgres -c "$PGBIN/psql -h /tmp -p 5440 -U postgres -d comms_test -v ON_ERROR_STOP=1 \
  -f prisma/sql/067_team_communications.sql"

POSTGRES_URL="$DB" DATABASE_URL_UNPOOLED="$DB" \
  npx prisma migrate diff --from-url "$DB" --to-schema-datamodel prisma/schema.prisma
```

**Expected**: both runs succeed (the second emits `already exists, skipping` notices and nothing
else). The diff reports **no difference**, or only the house `updatedAt DROP DEFAULT` lines
documented in migration `060`'s header. Anything else means the SQL and the schema disagree.

---

## Scenario 2 — the contrast rule, on every colour a unit can be

```bash
npm test -- comms-brand
```

**Expected**, from `tests/comms-brand.test.ts`:

| Brand | Ink | Ratio | Brand altered |
|---|---|---|---|
| `#0f2444` | white | 15.49:1 | no |
| `#450059` | white | 15.03:1 | no |
| `#E0653F` | dark | 5.08:1 | no |
| `#F2D65C` | dark | 12.10:1 | no |
| `#8A94A6` | dark | 5.71:1 | no |
| `#2E8B84` | dark | ≥4.50:1 | yes, ~4% |

Plus the properties, which matter more than the table: **every** output ≥ 4.5:1; the brand is
returned **unchanged** whenever either ink clears it; and a random sweep of a few hundred colours
produces no case below 4.5:1 and no adjustment above ~15%. If a sweep finds one, the rule is
wrong — not the colour.

---

## Scenario 3 — occasions: years, leap day, and no ages

```bash
npm test -- comms-occasions
```

**Expected**: a 2021-09-07 start date gives `years = 5` in 2026 · a 29 February birthday is
observed on 28 February in 2027 and on the 29th in 2028 · a birthday occasion carries
`years = null`, always · someone with no `dateOfBirth` produces no birthday occasion · someone
with `status = LEFT` produces nothing at all.

---

## Scenario 4 — end to end against a real database

```bash
POSTGRES_URL="$DB" DATABASE_URL_UNPOOLED="$DB" npx tsx scripts/verify-communications.mts
```

**Expected — every one of these, all passing:**

*Preparation*
- An anniversary three days out produces exactly one draft, assigned to the line manager.
- **Running the job again changes nothing** — same count, same ids. (The unique index is the
  guarantee; the test proves the guarantee is wired up.)
- A manager's own birthday is assigned to **HR**, not to themselves.
- Someone with no manager is assigned to HR.
- **No employee received email as a result of the run.** Asserted directly, not inferred.

*Sending*
- An audience of overlapping choices (a department **and** a named person inside it) produces
  **one** recipient row for that person, not two.
- Two recipients in different units get rows carrying **different** `businessUnitId`s.
- `email` on the row is the address as it was at send time.
- A second `sendAnnouncement` on the same message is **refused**, not sent twice.
- `confirmedCount` that no longer matches is **refused** — simulated by adding an employee to the
  audience between the count and the call.
- An empty audience is refused with a reason.

*Congratulations*
- A draft past its occasion date cannot be sent, and reads MISSED.
- A draft for someone who has left is refused.
- A sent congratulation records `sentById`, and the rendered body carries that person's name.

*Rendering*
- `renderMessage` with a null unit produces well-formed HTML carrying the message type and the
  group's colour — not a blank space where a unit name should be.
- The HTML contains **no** `<style>` block, **no** `var(`, and **no** `src="data:`. These are the
  three things that silently break in real mail clients, so they are asserted rather than trusted.

---

## Scenario 5 — the preview and the send are the same thing

```bash
npm run dev
# open /admin/communications/<id>, read the preview
# press "send me a test", open the mail
```

**Expected**: identical. If they differ at all, `renderMessage` is not the only builder and
research D8 has been violated.

---

## Scenario 6 — delivery readiness tells the truth

Open `/admin/communications/settings` in four states:

| State | Expected readout |
|---|---|
| Key + verified domain | **Ready** — messages reach everyone |
| Key + unverified domain | **Ready for you only** — everyone else silently receives nothing |
| Wrong key | Sending is not configured correctly — **the key**, not the domain |
| No network to the provider | **Could not check just now** |

The third and fourth are the ones that matter. A wrong key answered as "domain unverified" sends
an operator to fix DNS for a week. And "could not check" must never be rendered as "not verified" —
that is reporting a verdict on no evidence.

---

## What cannot be verified from a session, stated plainly

- **Real delivery.** No live Resend key here. The batch call is exercised against a stub that
  records what it was handed; that proves the chunking, the per-recipient stamping and the failure
  path, and proves nothing about whether mail arrives.
- **How the email renders in Outlook, Gmail or Apple Mail.** The markup follows the rules in
  research D7, and the assertions in Scenario 4 catch the three known killers — but rendering is
  observed, not derived. **This needs a real test send to a real inbox before the first
  announcement goes out.** That is what Scenario 5's test-send button is for, and it is the single
  most important manual check in this feature.
- **The cron firing on Vercel's schedule.** The route is exercised directly. That it runs at 06:00
  daily is Vercel's to demonstrate; check the function logs after the first deploy.
- **That a real unit's brand colour is set.** The email reads `primaryColor` from the business
  unit record. If Visual Shift's record does not carry `#450059`, emails will be branded with
  whatever it does carry. Worth checking in Admin → Brand before the first send.

---

## Cleanup

```bash
su postgres -c "$PGBIN/pg_ctl -D /var/tmp/comms_pg stop"
rm -rf /var/tmp/comms_pg /var/tmp/before.prisma
```
