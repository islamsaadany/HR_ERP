# Research: Team Communications (spec 039)

**Date**: 2026-08-24
**Purpose**: resolve every technical unknown before design. Each decision below was checked
against the running code or the installed library, not assumed.

---

## D1 — Can we send one message per person without N HTTP calls?

**Decision**: Yes. Use Resend's **batch endpoint**, up to 100 separate messages per request.

**Verified**: `resend@6.18.1` is installed and exposes `batch.send` (checked at runtime, not
from documentation). The app already depends on this package for the two existing workflows.

**Rationale**: FR-033 requires each recipient to receive their own message and forbids any
recipient seeing another's address. The obvious readings both fail:

- **A shared `to:` list** — every recipient sees every address. Refused outright.
- **BCC** — nobody sees anybody, but every recipient gets an *identical* body, which makes
  per-unit branding (FR-003) impossible. It also reports one success or one failure for the
  whole send, so FR-034 ("a failure names which recipient") cannot be satisfied.
- **A loop of individual sends** — correct, but a serverless function has seconds and Resend
  rate-limits; 148 sequential calls would time out partway with no record of where.

Batch gives privacy, per-person branding, and per-person failure reporting in one request.

**Alternatives considered**: a queue table drained by the existing daily cron. Rejected as
premature — the company is in the low hundreds, which is two batches. Worth revisiting only if
volume grows past a few thousand.

**Consequence for design**: an announcement to 148 people is 2 requests, not 1 and not 148. The
send is chunked at 100 and each chunk's results are recorded per recipient.

---

## D2 — How do we know email will actually reach people?

**Decision**: Ask Resend for the domain's verification status at the moment the setup page is
drawn, and report three distinct states plus "could not ask".

**Verified**: `resend@6.18.1` exposes `domains.list`.

**Rationale**: This is a silent-failure trap, and it is the reason SMP built the same thing.
Until a sending domain is verified, Resend delivers **only to the address the account was opened
with**. An administrator testing with their own address sees success and concludes it works; the
first real broadcast reaches nobody and reports no error.

FR-037 also requires the page to say when it *could not find out*, rather than reporting a state
it did not verify. Three failure modes are distinguishable and must not be collapsed:

| What happened | What the page says |
|---|---|
| Domain verified | Ready — messages reach everyone |
| Domain present, not verified | Ready **for you only** — everyone else silently gets nothing |
| Key refused | Sending is not configured correctly — the key is wrong, not the domain |
| Network failed | Could not check just now |

**Note taken from SMP**: Resend answers an invalid key with **400**, not 401. Matching on the
status code alone mislabels a bad key as an unverified domain. Match on the message as well.

---

## D3 — Where does the audience picker come from?

**Decision**: **Extract** the Learning module's audience derivation into a shared library; do not
write a second one.

**Rationale**: FR-011 and FR-012. The question "who does this reach?" is already answered once,
correctly, in `src/lib/learning/audience.ts` and `src/lib/learning/queries.ts` — including live
per-choice counts, the rule that a broken rule reaches nobody rather than everyone, and the
tenure-band-as-date-range subtlety. The constitution flags repetition at two uses; this is the
second.

It is also the failure mode this codebase has been bitten by twice (the pool ceiling, the
"everyone" duplication): two implementations of one rule, and the looser one decides.

**Shape**: move the rule compilation and counting to `src/lib/audience/` with no Learning-specific
naming, leaving `src/lib/learning/audience.ts` as a thin re-export so nothing in Learning changes
behaviour. The picker component moves the same way.

**Alternatives considered**: copy it and diverge later. Rejected — that is exactly how the
"everyone" trap was created.

---

## D4 — Which scheduled job prepares congratulations?

**Decision**: A **second daily cron** at `/api/cron/communications`, not an addition to the
holidays one.

**Verified**: `vercel.json` currently declares one cron (`/api/cron/holidays`, `0 6 * * *`) and
the route authenticates with a `CRON_SECRET` bearer token.

**Rationale**: two jobs with unrelated jobs-to-be-done should fail independently. A holiday
lookup erroring must not stop birthdays being prepared, and vice versa. The auth pattern,
the refuse-when-unconfigured stance, and the "choose work by DATE, not by whether yesterday ran"
discipline are all copied from the holidays route — that last one is what makes a missed day
self-healing rather than a gap.

**FR-028 holds absolutely**: the job creates drafts and notifies operators. It never emails an
employee. This is the same line spec 037 drew and it is not crossed here.

---

## D5 — How is text kept legible on an arbitrary brand colour?

**Decision**: Derive the ink from the background's relative luminance; adjust the background only
when neither ink passes.

**Measured** (not assumed) across six colours:

| Brand | Ink chosen | Ratio | Brand altered? |
|---|---|---|---|
| `#0f2444` Forefront navy | white | 15.49:1 | no |
| `#450059` Visual Shift | white | 15.03:1 | no |
| `#E0653F` coral | dark | 5.08:1 | no |
| `#F2D65C` pale gold | dark | 12.10:1 | no |
| `#8A94A6` mid grey | dark | 5.71:1 | no |
| `#2E8B84` mid teal | dark | 4.58:1 | **yes, 4%** |

**Rationale**: FR-005. The naive rule — a single luminance threshold picking black or white — was
tried first and **fails**: it puts white on the coral (3.44:1) and white on the teal (4.08:1),
both below AA. Trying *both* inks and taking whichever passes fixes five of six. Only a genuine
mid-tone needs the background nudged, and then by an amount nobody can see without the swatches
side by side.

An earlier variant that always deepened toward black was rejected after measuring it: it turned
the pale gold `#F2D65C` into `#837432`, an olive nobody would recognise as their brand.

**Consequence**: nobody has to think about contrast when choosing a unit colour. That is the
point — a rule that requires the operator to be careful is a rule that will be broken.

---

## D6 — Can a unit's logo appear in the email?

**Decision**: **No.** The design is typographic.

**Rationale**: unit logos are stored as **private** Vercel Blob URLs and served through
`streamPrivateBlob` behind a sign-in check. A mail client fetching an image is not signed in, so
it receives the sign-in redirect and renders a broken-image box. Embedding as a `data:` URI does
not rescue it — Gmail and Outlook block `data:` images outright, so it is a broken box in the two
clients most people read mail in.

**What would be needed**: serving unit logos from a public, unauthenticated URL. That is a
decision about making a logo public, and it has not been asked for. Recorded in the spec's
Assumptions rather than assumed away.

---

## D7 — What does "email is not the web" cost us?

**Decision**: tables for layout, every style inline, colours written literally, no CSS custom
properties, and a light-scheme declaration.

**Rationale**, each from a specific client behaviour rather than folklore:

- **Tables, not divs** — Outlook renders through Word, which has no flexbox, no grid, and no
  reliable `max-width` on a block.
- **Every style inline** — Gmail strips `<style>` from the head on some clients and keeps it on
  others. A design that depends on it is right half the time.
- **Colours literal** — `var()` is unsupported in most mail clients, and every colour here comes
  from a unit record anyway, so it is interpolated per send.
- **`color-scheme: light`** — states the design has a light ground on purpose, so a dark-mode
  client does not invert it into something nobody drew.

The app's existing `layout()` in `src/lib/email/templates.ts` already follows most of this; it is
extended rather than replaced.

---

## D8 — Is the preview really the same as the send?

**Decision**: one exported builder function. The preview route and the send path both call it.

**Rationale**: FR-035. A preview drawn from a React component that mirrors the email is a picture
of an email nobody will receive — the two drift on the first change, and the drift is invisible
until somebody complains about a real message. SMP states this as a rule and it is right.

**Consequence**: the preview is rendered server-side into an `<iframe srcdoc>`, not re-implemented
in JSX. That also means the preview shows the real mail-client-safe markup rather than a
web-styled approximation of it.

---

## D9 — What stops a congratulation going out twice, or late?

**Decision**: a stored **occasion key** with a uniqueness constraint, plus a state machine of
DRAFT → SENT | MISSED.

**Rationale**: FR-025 requires at most one draft per person per occasion per year regardless of
how often preparation runs — so idempotence must be structural, not "the job checks first".
The key is `(userId, kind, occasionYear)`, unique in the database. A second run's insert is a
no-op rather than a duplicate.

FR-026 requires that an unsent draft closes rather than sending late. Deriving "missed" from the
date at read time would be cheaper, but the state must be *stored* so the queue can show what
happened and so a sent-late attempt is refused at the write, not merely hidden at the read.

**29 February**: an occasion on the 29th is observed on 28 February in non-leap years rather than
skipped — otherwise three people in four years get nothing and nobody notices.

---

## D10 — Does changing the sender display name affect existing email?

**Decision**: Yes, and that is intended.

**Verified**: `src/lib/email/client.ts` builds `fromHeader` from a single
`NotificationSettings.fromName` for every send. There is one display name for the whole platform.

**Rationale**: FR-008. Setting it to "People of Forefront Group" re-brands the benefit-claim and
holiday emails too. One voice for everything the platform sends is the right outcome — but it is a
visible change to email already in production, so it is recorded here and in the spec's
Assumptions rather than shipped as a side effect nobody was told about.

**Alternative considered**: a per-workflow display name. Rejected as complexity bought for
nothing — nobody has asked for the claim emails to sound like a different sender.

---

## D11 — The measured defect in existing email

**Decision**: change the eyebrow from `gold-600 #a8821e` to `gold-500 #c9a227`.

**Measured**: on `navy-800 #0f2444` at 12px, `#a8821e` is **4.33:1** — below the 4.5:1 AA requires
for text under 18px. `#c9a227` is **6.40:1**.

**Rationale**: FR-042. It is a one-constant change in the file this feature is already editing,
and leaving a known contrast failure in place while adding a contrast *rule* beside it would be
incoherent.

---

## Unknowns remaining

None. Every NEEDS CLARIFICATION from the Technical Context is resolved above.
