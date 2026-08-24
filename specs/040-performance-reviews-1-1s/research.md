# Phase 0 Research — Performance Reviews & 1:1s

**Spec**: [spec.md](./spec.md) · **Agreed input**: [`specs/_parked/performance-reviews-and-1-1s.md`](../_parked/performance-reviews-and-1-1s.md)

Seven questions had to be answered before the design could be written. Two of them (R1, R3) change
what gets built rather than merely how.

---

## R1 — Impersonation defeats the privacy rule as written *(blocking)*

**Finding.** `requireUser()` in `src/lib/roles.ts` deliberately returns the **impersonation target**
when a Super User is "viewing as" an employee. The comment says it plainly: *"because nearly every
page/action resolves the current user through here, honoring impersonation at this one point makes
the whole app render and act as the target."*

That is exactly right for every existing module and exactly wrong for this one. A Super User could
switch to an employee and read that person's **private journal** — the one thing the spec promises is
readable by nobody (FR-016) — and both halves of any review they are party to. Nothing in the spec's
wording would be violated by the code; the hole is that "the current user" silently means someone
else. Building this module on `requireUser()` would ship a privacy promise the platform breaks by
design on day one.

**Decision.** This module resolves the **real session user** and refuses to operate at all while
impersonating. A new `requireRealUser()` — auth session only, no impersonation cookie — is the single
entry point for every reviews page, action, and route. While impersonating, the module's pages show a
short explanation and no data; its actions refuse.

**Rationale.** Refusing is better than silently un-impersonating: a Super User who is viewing as
someone else and lands on Reviews should be told the module is excluded, not quietly shown their own
reviews under someone else's identity. Refusal is also the only version that cannot be got wrong by a
later change to the impersonation cookie.

**Alternatives rejected.** *Filter journals out of impersonated sessions* — leaves reviews and 1:1s
exposed and requires remembering the exclusion at every new query. *Trust that Super Users won't* —
the spec's whole value is that the promise is structural, not behavioural.

---

## R2 — Access follows the stored pair, not the current org chart *(deliberate divergence)*

**Finding.** The platform's settled rule for Time-Off is the opposite of what this spec needs: leave
approvals resolve against the **current** org chart (`pendingApprovalWhere` / `canDecideLeave`),
never a stored approver snapshot, precisely so a stale snapshot cannot route an approval to the wrong
person. FR-033 requires the reverse here — a new manager must **not** inherit access to reviews
written with a previous one.

**Decision.** A review sheet and a 1:1 **store their pair** (`employeeId`, `managerId`) at creation,
and every read is authorised against the **stored** pair. The current org chart is used for exactly
one thing: deciding whom a *new* sheet or 1:1 is created with.

**Rationale.** These are records of a conversation between two named people, not a workflow routed to
a role. A leave request must reach whoever can approve it today; a review belongs to whoever had it.

**Rationale for writing it down**: a future session reading `leave-queries.ts` will recognise the
snapshot pattern as the bug it was there and "fix" it here. This divergence is intentional and is
recorded in Complexity Tracking in the plan.

---

## R3 — Opening is an event, not a computed state

**Finding.** The seal rule went through a rejected first version (open at quarter close). The settled
rule is that both halves open when — and only when — both parties submitted **and both** confirmed
they met. A quarter with no meeting opens nothing forever.

**Decision.** Four timestamps on the sheet (`employeeSubmittedAt`, `managerSubmittedAt`,
`employeeMetConfirmedAt`, `managerMetConfirmedAt`) plus a written `openedAt` stamped once all four are
present. `openedAt` is the **single** thing every read and write consults — one derivation
(`isOpen(sheet)`), never four booleans re-tested per call site.

**Rationale.** A stamped event, rather than a state recomputed from four fields at every call site, is
what makes "frozen" mean the same thing to the page, the actions, and any later export. It also makes
the freeze honest: `openedAt` is both the moment the halves became visible and the moment they became
read-only.

**Critical consequence for the UI layer.** A sealed half must never leave the server. The page loads
the other party's items **only when `openedAt` is set** — not fetched-and-hidden, not rendered behind
a conditional. FR-008 (no preview, no word count, no per-question completion state) means the query
itself is scoped, so there is nothing in the payload to leak.

---

## R4 — No cycle table: a quarter is derived, not stored

**Decision.** There is no `ReviewCycle` row. A sheet stores `year` and `quarter` (1–4); the date range
is computed by `src/lib/reviews/quarters.ts`. Nothing opens or closes a cycle.

**Rationale.** FR-002 forbids any screen for opening, closing, extending, or reopening a cycle. A
table would invite exactly that screen, and a stored row can drift from the calendar it is supposed to
mirror. Quarters follow the calendar year, consistent with Time-Off's per-calendar-year counting.

**Alternative rejected.** Seeding cycle rows ahead of time — needs a job to keep running forever and
adds a failure mode (the quarter nobody seeded) to a feature whose defining property is that it needs
no operator.

---

## R5 — Gallup PDF extraction: `unpdf`, verified on both real reports

**Decision.** Use **`unpdf`** for text extraction. Parse rule as validated in the agreed-input file:
page 1 only, numbered rank lines, names resolved against the fixed 34-theme vocabulary, stop at the
first gap.

**Verified, not assumed.** The rule was first prototyped in Python against both supplied reports, then
**re-verified in Node with `unpdf`**, which produced identical output: **34 ordered themes** from the
CliftonStrengths 34 report and **5** from the Top 5 report, with no per-format branching.

**Rationale.** `unpdf` is a serverless-targeted wrapper over pdf.js with no native/canvas dependency,
which matters because this runs in a Vercel Function. `pdf-parse` was rejected: its main entry runs a
debug harness that reads a test file from disk when imported without arguments, a known foot-gun in
bundled environments. Raw `pdfjs-dist` was rejected as more setup for the same result.

**Residual risk, stated plainly.** Verified locally on Node 22, not yet on Vercel. If the bundle
misbehaves there, the fallback path (FR-027, manual entry) already exists and is not a workaround
bolted on later — it is required behaviour either way.

---

## R6 — The system pack reuses the existing counters, it does not add new ones

**Decision.** Working days taken in a quarter is computed by extending the existing derivation
(`countWorkingDays` in `src/lib/workdays.ts` + the holiday set from `src/lib/holidays.ts`) with a
quarter date range, alongside the existing `takenByUserForYear`. Onboarding status reuses
`src/lib/onboarding.ts`; learning activity reuses the existing course-enrollment reads.

**Rationale.** The house rule earned the hard way (`audienceReachByRule`, 2026-08-22) is that a number
shown beside something must be computed **through the same derivation the real thing uses**. A second
working-day counter written to "look right" would eventually disagree with what Time-Off shows, and a
review is the worst possible place to display a number that contradicts another screen.

---

## R7 — The Gallup PDF is a personal document; the exclusion of HR does not cover it

**Decision.** The uploaded Gallup report is stored in the private Vercel Blob store and served through
an authorising route (`streamPrivateBlob`), readable by **the employee and HR/Super User** — the same
audience as `PersonalDocument`. HR uploads it and confirms the extracted themes.

**Rationale.** The HR exclusion (FR-031) is about **review sheets, outcomes, 1:1s, and journals** —
the contents of a private conversation. A strengths profile is employee-record data: HR administers
it, it appears on the employee's own profile, and somebody has to upload the file. Treating it as
secret would leave nobody able to do the job the requester asked for ("I will upload the PDFs").

**Boundary that must hold anyway.** The serving route answers **404, not 403**, to anyone not
entitled — the `EMPLOYEE_VISIBLE_SLOTS` lesson from Learning: a 403 confirms the file exists.
