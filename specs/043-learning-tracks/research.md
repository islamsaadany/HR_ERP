# Research — Learning Tracks (spec 043)

Five questions whose answers could only come from reading the code that exists, not from the spec.
Each is recorded as decision / rationale / what was rejected, because each has a plausible-looking
alternative that a later session would otherwise re-propose.

---

## 1. Where does the fifth access route actually go?

**Decision**: A `"TRACK"` member on the existing `AccessRoute` union, a `hasTrackAssignment: boolean`
on `AccessFacts`, one line inside `resolveRoutes`, and the fact populated by each of the three
fact-gatherers (`courseAccessFor`, `accessibleCoursesFor`, `courseRoster`).

**Rationale**: `resolveRoutes` is already pure — facts in, decision out, no database handle — and the
file carries an explicit warning that writing `if (assignment && !assignment.revokedAt)` anywhere
outside it is the second copy of the rule the module exists to prevent. The route slots into that
design exactly. It also inherits the grandfathering behaviour for free: `IN_PROGRESS` is deliberately
not conditional on any other route, so somebody mid-course who loses their track keeps the course,
which is FR-009 with no code written for it.

**Rejected**: resolving track access in `queries.ts` alongside the learner's list, which is where the
data is most conveniently to hand. That would put the rule in two places — the list would show a
course the player might refuse to open — and is precisely what the module's one-derivation structure
exists to stop.

**Note for the builder**: `courseAccessFor` fetches per course, `accessibleCoursesFor` fetches every
published course once and applies the rules in memory. The track fact must be gathered in the same
shape as the audience rules are — one query for the viewer's tracks, applied in memory — or the
bounded-query property of that reader is lost.

---

## 2. How is "never send the same reminder twice" done here?

**Decision**: `LearningReminderLog { userId, courseId, sentOn @db.Date }` with
`@@unique([userId, courseId, sentOn])`, written only after a successful send.

**Rationale**: This is exactly `ConfirmationReminderLog` (spec 041), which already solves the same
problem for the confirmation nudge and has been in production since August. Copying a proven shape is
cheaper than designing one, and a reviewer who knows one knows the other. The unique constraint is
the guarantee; the check before sending is the courtesy.

**Rejected**: a `lastRemindedAt` column on the enrollment or the track step. It answers "when did we
last chase" but not "did today's run already send", so a job that runs twice within the same day —
or is retried after a partial failure — can double-send. It also cannot express the five-message
bound without a second counter that can drift from it.

---

## 3. Where does the Learning-level switch live?

**Decision**: A new singleton `LearningSettings` table, read and written through
`src/lib/learning/settings.ts`, surfaced on the existing `/admin/learning/settings` page.

**Rationale**: The CEO asked for the switch to be in Learning's own settings. That page already
exists ("who runs Learning") and is readable by a learning manager. A singleton mirrors
`NotificationSettings`, so the idiom is not new.

**Rejected**: a column on `NotificationSettings`. It is the same shape and avoids a table, which is
why it was the first instinct — and it is wrong for the reason the *reuse a field when it is the same
FACT, not the same SHAPE* rule exists. That record is surfaced at Admin → Notifications, a screen a
learning manager cannot open. The switch would appear in the wrong place, and the person who is
supposed to be able to pull the brake could not reach it.

**The asymmetric authority** (off is open to whoever runs Learning, on requires an HR Admin) is a
departure from that settings page, where a learning manager reads and only HR writes. It is
implemented as two different guards on the same action rather than two actions, so there is one
write path to audit.

---

## 4. Which order wins, and where is that decided?

**Decision**: One derivation in `src/lib/learning/order.ts`, extended rather than joined by a second.
A person's sequence is: courses that belong to a track they are on, grouped by track and ordered by
the track's own step order; then everything else, in the company-wide course order. Within "to
finish" and "completed" as the employee page already splits them.

**Rationale**: `order.ts` was built on 2026-09-15 specifically to be the single place the sequence is
decided, and its own comment says the page and the write both read `STATUS_ORDER` so they cannot
disagree. Adding a parallel track-ordering function would fork exactly what that file was created to
prevent.

**Rejected**: giving each course a per-person order number computed when a track is assigned. It
makes reads trivial and is wrong the moment a track is edited, a second track is assigned, or a
manager reorders — every one of which would need to rewrite everybody's numbers, and any missed path
leaves a person with a stale sequence nothing would detect. Derive on read, as the module does with
progress and lapsing.

---

## 5. What happens to somebody on two tracks that share a course, in the query?

**Decision**: The course appears once. Its deadline is the earliest of the resolved dates from every
track that gives it one. Both kinds are resolved to real dates *before* comparison.

**Rationale**: Comparing a period against a fixed date is meaningless until both are resolved against
that person's track join date, which is what `resolveDeadline` is for. Doing the comparison anywhere
else would mean a second resolution — the exact fault FR-019a exists to prevent, and the one that
ends with a person told one date and chased on another.

**Rejected**: refusing to let a course appear in two tracks. It sounds tidy and it is a real
constraint on the operator for no benefit — "Ethics" genuinely belongs in several paths, and
forbidding it would push people into duplicating courses instead.

---

## Not researched, because the spec settled them

Recorded so nobody re-opens them: whether editing a track changes it for people already on it (yes),
whether progress belongs to the course or the track (the course), whether assigning a track emails
anybody (no — only a missed deadline does), and whether a track's courses must be published to be
added (yes). All four are in the spec's *Assumptions*.
