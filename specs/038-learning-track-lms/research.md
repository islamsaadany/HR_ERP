# Research: Learning Track — decisions & rationale

**Feature**: `specs/038-learning-track-lms` · **Date**: 2026-08-21

Phase 0 output. Every decision below is one the implementation is bound by; where a real
alternative existed it is recorded with why it lost.

---

## D1 — Auth idiom: house `requireUser`, not a second `Principal`/`authorize` layer

**Decision**: role gating uses the existing `src/lib/roles.ts` helpers (`requireUser`,
`requireAdmin`, `isAdmin`). We do **not** import FFLMS's `Principal` + `authorize()` + `Action`-union
policy. We **do** keep its *pure-function* discipline for the one rule that earns it — course access
(D3) — as a plain function over already-loaded facts, with no DB handle.

**Rationale**: this codebase already answers "who are you and may you do this" one way, across ~20
admin pages and every server action. Adding a second idiom for one module means two answers to the
same question, and the next person has to know which one governs. That is precisely the shape of the
pool-ceiling failure (three derivations of one rule; the loosest one paid). FFLMS's design is good
*for FFLMS*, where ownership (`course.instructorId === principal.id`) makes the matrix genuinely
complex. We deleted the instructor role, so our matrix is: HR Admin/Super User may author, everyone
may learn. That does not need an `Action` union.

**Alternatives considered**: adopt `authorize()` wholesale for the learning module — rejected as
above. Retrofit the whole app to `authorize()` — out of scope for this spec, and not obviously an
improvement given the existing helpers work.

---

## D2 — Audiences are stored as rules and compiled to **one** query

**Decision**: `CourseAudience` rows hold `{ courseId, kind, value }` with
`kind ∈ ALL_ACTIVE | DEPARTMENT | BUSINESS_UNIT | EMPLOYMENT_TYPE | TENURE_BAND | REPORTS_TO`.
Several rows on one course **union** (OR), never intersect. A single pure function
`audienceWhere(rows, now) → Prisma.UserWhereInput` compiles them into one `where` clause, always
`AND`-ed with `status: "ACTIVE"`.

**Rationale**: FFLMS has no equivalent — it expands a group into stored membership rows, which is
exactly what FR-014 forbids (a new joiner must be picked up with no HR action). Storing the *rule*
rather than its expansion means the answer is always current by construction, and compiling to a
`where` keeps the per-course direction ("who does this reach") a single query instead of one per
employee.

Union rather than intersection because that is how the request is spoken: "this is for Consulting
and for the part-timers" means both groups, not the two-person overlap. An intersection is
expressible as an ad-hoc group when it is genuinely wanted.

**The tenure-band subtlety**: `User.tenureBand` is a stored column, but `deriveTenureBand()` computes
the truth from `startDate`, and the house rule is that it is auto-calculated and never hand-entered —
so the column can be stale. Filtering on it would give a confidently wrong answer. Instead a
`TENURE_BAND` audience compiles to a **`startDate` range** derived from the band at query time
(`bandStartDateRange(band, now)`), which is both the derived truth *and* expressible in SQL. People
under six months have no band and fall outside every range naturally.

**Nullable registry fields**: a `DEPARTMENT` audience compiles to `{ department: value }`, which
excludes rows where `department` is null with no special handling. No audience kind ever uses
negation, so a person with a missing field is simply not matched — never an error (FR-016 edge).

**`REPORTS_TO` is direct reports only**, not the whole subtree. A subtree audience is a later
addition; saying so now stops it being assumed.

---

## D3 — One access derivation, four routes, three entry points

**Decision**: `src/lib/learning/access.ts` is the only place that answers "may this person open this
course". Four routes grant it — a live direct assignment, membership of a group with a live group
assignment, matching a live audience, or **being mid-course** (D4). It exposes three entry points
over **one** rule:

| Entry point | Question | Used by |
|---|---|---|
| `courseAccessFor(userId, courseId)` | may this person open this course, and by which route(s)? | course player, every learning write |
| `accessibleCoursesFor(userId)` | which courses does this person hold? | the employee Learning list |
| `courseRoster(courseId)` | who holds this course, and by which route? | the HR roster, reopen targeting |

All three assemble facts and hand them to the same pure `resolveRoutes(facts)`. No call site
re-implements any part of the rule.

**Rationale**: this is `src/lib/benefits/pool.ts` applied to access instead of money — pure core,
thin DB wrappers, both a per-subject and a bulk reader so a whole-company view never costs one query
per row. FFLMS's `hasRemainingAccess` is the starting shape but covers only two of our four routes
and only the per-person direction.

**Alternatives considered**: materialising access into an `access` table kept in sync by triggers or
application code — rejected, because it re-introduces exactly the staleness FR-014 exists to prevent,
and every registry edit becomes a fan-out write.

---

## D4 — Grandfathering is **derived**, not a flag

**Decision**: in-progress standing is not stored as a boolean anyone has to maintain. An enrollment
row is created **when the employee first opens the course**, not when it is assigned. A person is
grandfathered when an enrollment exists with `startedAt` set, `completedAt` null, and
`accessWithdrawnAt` null. Nothing is written when a route is removed.

**Rationale**: this makes FR-042, FR-043 and FR-045 fall out of one rule instead of three:

- **FR-042** (keep access mid-course) — the enrollment *is* a route, read by the same derivation.
- **FR-043** (ends on completion or withdrawal) — `completedAt` or `accessWithdrawnAt` being set
  stops the route granting; no cleanup job, no event to miss.
- **FR-045** (never started ⇒ lose it immediately) — no enrollment exists, so there is nothing to
  grant. Free.

Had grandfathering been a flag set when a route is removed, every route-removal path (revoke a
direct assignment, revoke a group assignment, remove a group member, delete an audience, employee
changes department, employee marked LEFT) would have to remember to set it. Six paths, one forgotten,
and someone silently loses their half-finished course.

**Deliberate divergence from FFLMS**, which auto-enrols on assignment. Here **assignment ≠
enrollment**: assignment is eligibility, enrollment is "has begun". Recording them separately is what
makes FR-045 expressible at all.

---

## D5 — Reopening: decided at the edit, applied in the same transaction

**Decision**: `CourseEnrollment` carries `completedAt`, `firstCompletedAt` and `reopenedAt`. Reopening
sets `firstCompletedAt` (from `completedAt` if not already set), clears `completedAt`, and stamps
`reopenedAt`. Nothing is deleted.

The decision travels **with the edit**. A curriculum edit that increases the required-lesson set on a
published course must carry an explicit `onExistingCompletions: "REOPEN" | "KEEP"`. The server
re-counts affected employees inside the transaction and, **if completions exist and no choice was
supplied, refuses the edit**. The prompt is a UI affordance; the refusal is the guarantee (FR-039 —
"neither outcome may be applied silently" holds even against a client that skips the dialog).

Reopening is applied only to enrollments whose user appears in `courseRoster(courseId)` at that
moment (FR-041), so someone who finished and has since lost every route is not drawn back in.

**Rationale**: a two-step "preview count, then apply" is racy — the count can change between the two
calls. Carrying the choice into the single write and re-checking there is both simpler and correct.

**Alternatives considered**: versioning the whole curriculum and stamping completions with a version
— defensible, and how a large LMS would do it, but it multiplies the data model for a 19-person firm
and answers a question nobody has asked (which version did they complete?). Rejected as
over-engineering; `firstCompletedAt` + `reopenedAt` answers what the roster actually shows.

---

## D6 — Progress: nothing denormalised, watched-time maxed **in SQL**

**Decision**: course percentage is **computed** from `LessonProgress` rows via the lifted pure
`computeProgressPercent`, never stored. `completedAt` / `firstCompletedAt` / `reopenedAt` *are*
stored, because they are dated facts rather than a cache. Progress is keyed by `lessonId`
(FR-023), and deleted lessons are soft-deleted and excluded by the caller so they leave the
denominator without disturbing anyone's completions.

Watched seconds are advanced with a **SQL-side `GREATEST`**, not a read-then-`Math.max` in
application code.

**Rationale**: the "nothing denormalised" line from spec 034's report builder applies here for the
same reason — a cached percentage is one more thing that can disagree with the rows. At this scale
the computation is free.

The `GREATEST` is a deliberate improvement on the source material: FFLMS reads the existing value and
maxes it in JavaScript, which loses an update when the same learner has the lesson open in two tabs
(both read 100, both write their own figure, the lower one lands last). One statement removes the
race entirely.

---

## D7 — The impersonation guard lives in the actor resolver, not in each action

**Decision**: a single `requireLearner()` in `src/lib/learning/actor.ts` resolves the acting learner:
it calls `requireUser()`, then `getImpersonation()`, and **refuses when impersonation is active**.
Every learning write begins with it, and **no learning write accepts a user id as a parameter** — the
learner is only ever the value `requireLearner()` returns.

**Rationale**: FR-026/SC-009 is an integrity rule about a training record, and the failure mode is
someone adding a fourteenth action six months from now and forgetting the check. Making the actor
resolver the only source of the learner id means a new action cannot be written *without* passing
through the guard — there is no other way to find out who is learning.

**Note on the existing design**: `requireUser()` deliberately returns the *impersonated* user so the
whole app renders as the target — that is right for reads (an admin should see the employee's
Learning list as they see it) and wrong for writes. `requireLearner()` keeps reads working exactly as
they do today and blocks only the writes.

---

## D8 — Video is linked, not hosted (**resolved 2026-08-21**)

**Decision**: lesson video is supplied as a **link** — unlisted Vimeo, unlisted YouTube, or a direct
file URL. The platform hosts no video. Course covers and downloadable lesson files still go to the
existing private Blob store as they do everywhere else in the app.

**Rationale**: the two measurable link sources give employees an identical experience to a hosted
file — resume, watch-gating and checkpoints all work through their player APIs — for none of the
cost. Hosting would need a byte-range streaming path the platform does not have (see below), and the
confidentiality gain is smaller than it looks: an unlisted Vimeo link and an unguessable blob URL are
the same posture. Hosting returns as its own spec if HR meets content that cannot go on Vimeo — at
which point option C below is the honest answer and its cost is accepted deliberately.

**What made this a real decision rather than a default**:

**What is true today**: the Blob store is used exclusively with `access: "private"`
(`profile/documents-actions.ts`, `admin/knowledge/actions.ts`), and private blobs are streamed back
through a Function by `src/lib/blob-serve.ts`. That helper returns the whole body and **does not
implement HTTP Range**, which video seeking and resume require. Uploads today go through a server
action, and `next.config.mjs` sets no `serverActions.bodySizeLimit` (Next's default is 1 MB), which
is worth verifying independently of this feature — `documents-actions.ts` advertises a 10 MB cap.

The alternatives, for the record: **B — client-direct upload to a public blob** (small to build; the
URL is public-but-unguessable, so no better than an unlisted link while making the content ours to
store); **C — client-direct upload to a private blob plus a Range-capable streaming route** (the only
option where video genuinely cannot be watched without signing in, at the cost of implementing Range
correctly and pushing every watched byte through a Function).

`src/lib/video.ts` (D9) is unaffected either way — it already classifies and normalises exactly these
link forms, which is most of what this release needs from it.

---

## D9 — What is lifted from FFLMS, and what is not

Confirmed ours to reuse (2026-08-21). Checked out read-only at `/home/user/ahmedgalal-lang/fflms`.

**Lifted near-verbatim** (adapted only for import paths and house naming):

| Source | Lines | Destination | Notes |
|---|---|---|---|
| `src/lib/video.ts` | 120 | `src/lib/learning/video.ts` | URL classification/normalisation; no deps, client-safe |
| `services/progress-calc.ts` | 48 | `src/lib/learning/progress.ts` | percentage over required lessons, resume point |
| `services/course-assignment-calc.ts` | 65 | seed for `src/lib/learning/access.ts` | extended from 2 routes to 4 (D3) |
| their unit tests for the above | — | `tests/learning-*.test.ts` | pure-function tests, the kind the constitution endorses |

**Design basis, re-expressed**: the learning schema (see `data-model.md`), the video player's
tick-processing structure, and the watch-gating rules.

**Not taken**: `User`/`Account`/`Session`, argon2, sign-up, password reset, the GitHub provider, the
public catalog, the instructor role and Studio ownership model, admin user CRUD, `grading-calc.ts`
(quizzes are deferred), the Supabase upload path, bytes-in-Postgres `FileAsset`, all shadcn/Radix
components, the Tailwind v3 config, and the CI/Playwright gate.

**Naming re-expressed to avoid collisions**: their `Module` → our `CourseSection` (`ModuleFlag`
already means app area here); their `Announcement` is not carried over at all (a model of that name
exists); their `Enrollment` → `CourseEnrollment`; their `Group` → `LearnerGroup`.
