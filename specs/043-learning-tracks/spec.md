# Feature Specification: Learning Tracks — priorities and deadlines per employee

**Feature Branch**: `claude/elegant-heisenberg-80hdml`

**Created**: 2026-09-16

**Status**: Draft — clarified 2026-09-16, ready for `/speckit-plan`

**Input**: The CEO, after the admin course-ordering work landed: *"we will need to think next on the learning track of everyone .. so we can set the learning priorities of each employee and set it by the admin maybe and the person's manager so he can show progress"*

---

## Why this exists

Learning today answers one question well: *which courses reach this person?* It cannot answer the
next one: *in what order, and by when?*

The whole company's courses sit in one order, set centrally (built 2026-09-15). That order is the
same for everybody. It cannot say "a new consultant does the introduction, then ethics, then
proposal writing, in that order, in their first ninety days" while a finance joiner does something
else entirely. And an employee's own page, which lists what they still owe, has no way to say which
of five outstanding courses matters first.

A **track** is a named path — an ordered list of courses — that is assigned to a person or a group
and answers both questions at once.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Build a path once and hand it to people (Priority: P1)

Whoever runs Learning creates a track, names it for the situation it serves ("New consultant —
first 90 days"), puts courses into it in a deliberate order, and assigns it to a person or to a
group. Everyone on that track now holds those courses, and meets them in that order.

**Why this priority**: This is the feature. Without it there is nothing; with it alone, a new joiner
already gets a coherent, ordered start instead of an unordered pile, and nobody rebuilds the same
sequence per person.

**Independent Test**: Create a track with three courses, assign it to an employee who held none of
them, sign in as that employee, and see exactly those three at the top of their learning page in the
track's order.

**Acceptance Scenarios**:

1. **Given** an employee holding no courses, **When** they are put on a track of three courses,
   **Then** all three appear on their learning page, in the track's order, named as belonging to
   that track.
2. **Given** a track assigned to a group, **When** a person joins that group, **Then** they hold the
   track's courses without anybody assigning anything further.
3. **Given** a track containing a course that is a draft or paused, **When** an employee on that
   track opens their learning page, **Then** that course does not appear and cannot be opened —
   unpublished work reaches nobody, track or no track.
4. **Given** an employee on a track, **When** the track is edited to add a course, **Then** the new
   course appears for everyone currently on the track.
5. **Given** an employee already holding a course through an audience rule, **When** they are put on
   a track containing that same course, **Then** it appears once, and their existing progress on it
   is untouched.

---

### User Story 2 — A deadline that actually chases (Priority: P2)

A step in a track carries a target date. When the date passes with the course unfinished, the
employee is emailed. Their manager is told too. The reminder repeats on a bounded schedule and then
stops.

**Why this priority**: Explicitly requested, and the reason the CEO asked for priorities at all — a
priority with no date is a preference. It is P2 rather than P1 because a track that orders work is
already useful, and the chasing can be added to it without rework.

**Independent Test**: Put an employee on a track with a target date already in the past, run the
daily job, and confirm the employee receives one email naming the overdue course and their manager
is told; run it again the same day and confirm nothing is sent twice.

**Acceptance Scenarios**:

1. **Given** a course on a track whose target date has passed and which the employee has not
   completed, **When** the daily job runs, **Then** the employee is emailed once about it and their
   manager is told.
2. **Given** that same overdue course still unfinished, **When** the daily job runs again on the
   same day, **Then** nothing further is sent — a job that runs twice cannot email twice.
3. **Given** an overdue course, **When** the employee completes it, **Then** no further reminder is
   ever sent for it.
4. **Given** notifications are switched off at the master toggle, **When** the daily job runs,
   **Then** nothing is sent and no state is corrupted.
5. **Given** the email service fails, **When** a reminder is attempted, **Then** the failure does not
   block or corrupt anything, and the reminder is not silently recorded as delivered.
6. **Given** a course with no target date, **When** the daily job runs, **Then** nobody is chased
   about it — a date is optional, and its absence means "no deadline", never "overdue".

---

### User Story 3 — A manager shapes their own people's list (Priority: P3)

A manager opens one of their direct reports and can add courses on top of what the company assigned,
and order that person's list. They cannot remove, or push aside, anything the company requires.

**Why this priority**: It is the half of the CEO's request about the manager, and it is genuinely
valuable — but the company's own paths are what make the feature coherent, and a manager's additions
are meaningless until those exist.

**Independent Test**: As a manager, add a course for one direct report and reorder their list; then
attempt to remove a course that came from a company track and confirm it is refused — both on screen
and when the refusal is bypassed and the request made directly.

**Acceptance Scenarios**:

1. **Given** a manager and their direct report, **When** the manager adds a course for that person,
   **Then** that person holds it, and it is visibly distinguishable from what the company assigned.
2. **Given** a course the person holds because of a company track, **When** the manager tries to
   remove it, **Then** it is refused, and the refusal says why — not merely absent from the screen.
3. **Given** a manager, **When** they open somebody who is not their direct report, **Then** they
   cannot see or change that person's learning.
4. **Given** a refusal enforced on screen, **When** the same change is submitted directly rather than
   through the screen, **Then** the server refuses it on its own authority.
5. **Given** a person whose manager changes, **When** the new manager opens them, **Then** the new
   manager can shape their learning and the previous one can no longer do so.

---

### User Story 4 — Seeing where everybody is (Priority: P4)

An employee sees their own path and how far along it they are. Their manager sees the same for each
of their people. Whoever runs Learning sees it for anyone.

**Why this priority**: Partly exists already — a manager has a team training page — so this is mostly
making that page speak in terms of tracks and deadlines rather than a fresh surface.

**Independent Test**: With one employee part-way through a track, confirm the employee, their
manager and an HR admin each see the same position and the same overdue state, from their own pages.

**Acceptance Scenarios**:

1. **Given** an employee half way through a track, **When** they open their learning page, **Then**
   they see which step they are on and what is next.
2. **Given** the same employee, **When** their manager opens the team training page, **Then** the
   manager sees the same position and the same overdue state the employee sees.
3. **Given** an overdue course, **When** any of the three people look, **Then** all three see it
   marked overdue, and no two screens disagree about whether it is.

---

### Edge Cases

- **A course is removed from a track while people are part-way through it.** The obligation ends, but
  anyone who has started it keeps access to finish — the module's existing rule that being mid-course
  is itself a route to the course is not overridden by tracks.
- **A person is put on two tracks that both contain the same course.** It appears once. It is
  complete when it is complete. Where the two give it different deadlines, BOTH are resolved to real
  dates first (one may be a period and the other a fixed date) and the earlier governs — a deadline
  must never be made later by adding work.
- **A track is taken away from someone.** The obligation ends; anything they have already completed
  stays completed; anything they have started, they keep until they finish it.
- **The same course sits in a track and is also reached by an audience rule.** It appears once, and
  losing one route does not lose the course while the other stands.
- **A track contains a course that is later paused or deleted.** It stops appearing for the people on
  the track; the track itself is not broken, and nothing about it is silently deleted.
- **An employee has no manager** (nobody to tell about an overdue course). They are still chased; the
  notice that would have gone to a manager goes to whoever runs Learning instead, rather than to
  nobody.
- **An employee's target date falls on a public holiday or a weekend.** Out of scope for this
  feature: a date is a date. Time-Off's working-day counting is not applied to learning deadlines.
- **A person leaves the company or is deactivated.** They are not chased.
- **A track with no courses in it.** It can exist while being built, but assigning an empty track
  must say plainly that it will give the person nothing.
- **A course on a track is completed, then its renewal period lapses.** It returns to the person's
  list exactly as it does today, and the track's deadline for it does not resurrect with it — the
  original deadline described the first time round.

---

## Requirements *(mandatory)*

### Tracks and what they are

- **FR-001**: Whoever runs Learning MUST be able to create, rename and delete a track. A track has a
  name and an ordered list of published courses.
- **FR-002**: A track MUST be assignable to an individual employee and to an existing group of
  employees. A track assigned to a group MUST reach anyone who joins that group afterwards, without
  further action.
- **FR-003**: A track MUST be reusable — assignable to many people — and MUST NOT require any
  per-person editing to be useful.
- **FR-004**: The order of courses within a track MUST be settable by whoever runs Learning, through
  the same kind of control the course list already uses, and MUST NOT introduce a second, different
  way of ordering things.
- **FR-005**: Deleting a track MUST state plainly what will happen to the people on it before it
  happens, and MUST NOT silently strip courses from anyone part-way through one.

### Access — the load-bearing constraint

- **FR-006**: Being on a track MUST itself grant the person its courses. Assigning a track is a
  single act; it MUST NOT require the courses to be separately assigned.
- **FR-007**: A track MUST be decided as an access route in the SAME single place every other route
  is decided. The module today has exactly four routes — an assignment to the person, an assignment
  to a group they belong to, an audience rule they match, and being mid-course — all resolved through
  one derivation with three entry points. A track is the fifth, and nothing anywhere else in the
  system may read track membership to decide whether somebody can open a course.
- **FR-008**: A course that is a draft or paused MUST reach nobody, including through a track.
- **FR-009**: Losing a track MUST NOT take away a course the person still holds by another route, and
  MUST NOT take away a course they have started but not finished.
- **FR-010**: There MUST be no self-enrolment onto a track, and no browsable catalogue of tracks for
  employees. An employee sees the track they are on, not the tracks that exist.

### Who may do what

- **FR-011**: Creating, editing, deleting and assigning company tracks MUST be limited to whoever
  runs Learning — the existing authority for the module (the role, or the appointment). It MUST NOT
  introduce a new role.
- **FR-012**: A manager — the capability derived from the org chart, an employee with direct reports
  — MUST be able to add courses for their own direct reports, and to order that person's list.
- **FR-013**: A manager MUST NOT be able to remove, or reorder away the obligation of, anything a
  company track requires. A manager's additions sit alongside the company's requirements, never
  instead of them.
- **FR-014**: A manager MUST NOT be able to see or change the learning of anybody who is not their
  direct report.
- **FR-015**: Every refusal in FR-013 and FR-014 MUST be enforced by the server on its own authority.
  A control absent from a screen is not a control.
- **FR-016**: Where a manager cannot act on something, the screen MUST say why on the row itself,
  rather than silently omitting the control — an absent button is indistinguishable from a bug.
- **FR-017**: A person's own learning MUST be shaped by their CURRENT manager, resolved at the time
  of the action, consistent with how time-off approvals already work — not by whoever managed them
  when the track was assigned.

### Deadlines

- **FR-018**: A course within a track MUST be able to carry an optional deadline, of EITHER of two
  kinds (clarified 2026-09-16), chosen per step:
  - **a period** — a number of days, counted from the day that person was put on the track, so an
    onboarding path works for a January joiner and a September joiner alike; or
  - **a fixed date** — the same calendar date for everybody on the track, for a company deadline
    that genuinely falls on a day ("everyone completes Ethics by 31/12").

  A step MUST carry at most one of the two, never both. A course with no deadline has none, and its
  absence MUST NEVER be read as overdue.
- **FR-019**: A course is overdue when its deadline has passed and the person has not completed it.
  Overdue MUST be derived from the deadline and the completion, never stored as a flag and never set
  by a scheduled job — consistent with how course renewal lapsing already works.
- **FR-019a**: Both kinds of deadline MUST resolve to an actual date for one person through ONE
  derivation, and every screen, comparison and reminder MUST read that. Two kinds of deadline is the
  one place this feature buys real complexity, and the way it goes wrong is a second, slightly
  different resolution written for a screen — after which a person is told one date and chased on
  another.
- **FR-019b**: A screen showing a deadline MUST show the resolved date, not the rule that produced
  it. "By 14/12/2026" is what a person can act on; "30 days after you started" makes them do
  arithmetic to find out whether they are late. Where the operator is SETTING it, the rule is what
  they see and edit.
- **FR-020**: When a course is overdue, the EMPLOYEE MUST be emailed about it, and their manager MUST
  be told. Where the person has no manager, the notice intended for a manager goes to whoever runs
  Learning instead.
- **FR-021**: Reminders MUST be bounded, and the bound is (clarified 2026-09-16): **one email on the
  day the course goes overdue, then one a week for four weeks, then silence** — at most five about
  any one course. After that the course stays visibly overdue to the person, their manager and
  whoever runs Learning; it simply stops arriving by email. The bound is a decision, not a default:
  it MUST NOT be widened without the same person who set it saying so.
- **FR-022**: The same reminder MUST NOT be sent twice. A scheduled job that runs twice in a day, or
  is retried, MUST NOT produce a second email; what has been sent MUST be recorded.
- **FR-023**: Completing a course MUST stop every reminder for it immediately.
- **FR-024**: Reminders MUST honour the platform's existing notification settings, including the
  master switch, and MUST be fire-and-forget — a mail failure must never block or corrupt a state
  change, and must never be recorded as a successful send.
- **FR-025**: All dates MUST display as dd/mm/yyyy.

### Seeing it

- **FR-026**: An employee MUST see the track they are on, their position in it, and which courses are
  overdue.
- **FR-027**: A manager MUST see the same for each direct report, in the place that already exists for
  team training rather than in a second place that can disagree with it.
- **FR-028**: Whoever runs Learning MUST be able to see, for any track, who is on it and how far each
  person has got.
- **FR-029**: Any count or figure shown beside a decision MUST be computed through the same
  derivation the real check uses — a number written separately to look right will eventually disagree
  with what actually happens.
- **FR-030**: The employee's learning page MUST remain a list of obligations rather than a catalogue:
  no browsing, no search, no self-enrolment.

### Ordering — which order wins

- **FR-030a**: A track's order is an ORDER, NOT A LOCK (clarified 2026-09-16). The courses appear in
  the track's sequence and the next one is obvious, but no course is ever blocked by an unfinished
  one before it. Rejected deliberately: gating step two behind step one would make one stuck course
  wall off everything behind it, and pausing a course mid-path would silently strand everybody on
  that track until somebody noticed.
- **FR-031**: Within a track, the track's own order governs.
- **FR-032**: A course a person holds that is NOT part of any track MUST continue to be ordered by the
  company-wide course order set by whoever runs Learning.
- **FR-033**: Where a person holds both, the spec MUST NOT fork the ordering rule: there is ONE place
  that decides the sequence a person meets their courses in, and it consults both the track order and
  the company order rather than either being re-implemented.
- **FR-034**: Reordering, whether of a track or of the company list, MUST NOT touch anybody's
  progress, completion or access.

### Key Entities

- **Track**: A named, ordered path of published courses. Has a name, an order, and the courses in it.
  Exists independently of who is on it.
- **Track assignment**: The fact that a person, or a group, is on a track. Carries who put them
  there and when — the "when" is what a relative deadline would be measured from.
- **Track step**: A course's place within a track: its position, and its optional target date.
- **Personal addition**: A course a manager added for one person, outside any company track.
  Distinguishable from a company requirement, because the two carry different authority.
- **Reminder sent**: The record that a particular person was chased about a particular course on a
  particular day — what makes FR-022 true.

---

## Success Criteria *(mandatory)*

- **SC-001**: A new joiner is set up with their full first-quarter learning, in order, in under two
  minutes and in a single action.
- **SC-002**: Two people given the same track receive an identical set of courses in an identical
  order, with no per-person work.
- **SC-003**: An employee opening their learning page can say, without scrolling or interpreting,
  which single course to do next and whether anything is late.
- **SC-004**: A manager can see, for their whole team at once, who is behind — in one place, without
  opening each person.
- **SC-005**: No employee receives more than five emails about the same overdue course — one on the
  day, four weekly — however many times the scheduled job runs, and none at all once they finish it.
- **SC-005a**: A person is told the same deadline date that they are chased on, whichever kind of
  deadline produced it.
- **SC-006**: A course that a company track requires cannot be removed from an employee by anyone
  other than whoever runs Learning — demonstrated by attempting it both through the screen and
  around it.
- **SC-007**: Every course an employee can open is explainable by one of the five routes, with no
  route decided anywhere but the one place — demonstrated against a real database.
- **SC-008**: Nobody part-way through a course loses it as a result of any track change.

---

## Assumptions

These were chosen as reasonable defaults rather than asked, because a defensible answer already
exists in how the module behaves today. Each is listed so it can be overturned cheaply.

- **Editing a track changes it for everyone already on it.** Adding a course adds it to everyone on
  the track; removing one removes the obligation (subject to FR-009); reordering reorders everyone.
  This is what makes a track a template rather than a snapshot. The alternative — people keep the
  version of the track they were given — was rejected as unmanageable: two joiners a month apart
  would silently be doing different things.
- **A course appears once, however many tracks contain it**, and completing it completes it
  everywhere. Where two tracks give it different dates, the earlier one governs.
- **Progress belongs to the course, not the track.** Someone who completed a course last year and is
  then put on a track containing it is already done with that step. Tracks do not re-open anything;
  only the existing renewal rules do that.
- **Assigning a track does not email anybody.** Only a missed deadline does. Being given work is not
  an event that needs an email; missing it is.
- **A track's courses must be published to be added to it.** Building a path out of drafts would
  create a track that silently reaches nobody.
- **Deadlines are not working-day aware.** Time-Off counts working days because leave is measured in
  them; a learning deadline is a date.
- **No certificates, no scores, no completion reports beyond what already exists.** This feature is
  about order, obligation and time.

---

## Clarifications

### Session 2026-09-16

Three questions were left open when the spec was drafted, because each had more than one defensible
answer and no safe default. All three were put to the CEO with the trade-offs stated, and answered.

- **Q: What shape is a deadline — a period from joining the track, a fixed calendar date, or both?**
  → **A: Both, chosen per step.** (FR-018.) The most expensive of the three answers and taken with
  that on the table: it is two kinds of date to set, show, explain and chase. It is also the only
  answer that serves both real cases — an onboarding path assigned all year round, and a company
  deadline that falls on an actual day. The cost is contained by FR-019a: both kinds resolve to one
  date through one derivation, so nothing downstream knows there were ever two kinds.

- **Q: How often is somebody chased once a course is overdue, and for how long?**
  → **A: On the day, then weekly, stopping after a month** — at most five emails about one course.
  (FR-021.) The question that carries the blast radius, since these go to the whole company on a
  schedule with no human choosing to send them.

- **Q: Is a track's order enforced — step two locked until step one is done — or is it a recommended
  sequence?**
  → **A: An order, not a lock.** (FR-030a.) Nobody can be stranded, and a paused course cannot wall
  off a team's path.

---

## Deliberate deviations from the constitution

Recorded here so that a later session does not "fix" them back, and so the departure is visible to
whoever reviews this spec.

### A scheduled process will email an employee — reversing a NON-NEGOTIABLE

The constitution states, and has restated through four widenings of the email rule:

> **NON-NEGOTIABLE, and untouched by the widening: no scheduled process may email an EMPLOYEE.**
> Scheduled work prepares drafts and nudges operators. Every message that reaches an employee is the
> result of a person reading it and choosing to send.

FR-020 breaks this. The CEO chose it explicitly on 2026-09-16, having been shown the rule and the
three alternatives (no dates at all; dates only a manager sees; dates that chase people by email).
The reason: **a deadline nobody is reminded of is not a deadline.**

What this costs, stated rather than buried:

- Learning becomes the **sixth** email workflow, after benefit claims, the holiday/vacation
  workflow, Team Communications, payback, and the time-off request cycle.
- It is the **first** scheduled job in the platform that writes to employees rather than to HR or an
  appointed operator, and therefore the first message anybody receives that no human chose to send.
- The blast radius is everyone, not one person: a mistake in the date logic reaches the whole company
  at once. This is why FR-021 (bounded) and FR-022 (never twice) are requirements and not niceties,
  and why Open Question 2 must be answered before this is planned.

**Follow-up required**: the constitution must be amended to record this, through
`/speckit-constitution`, rather than being left in contradiction with a shipped feature. That is a
separate step and has not been done.

### A fifth access route

The module's four routes and their single derivation are a deliberate structure, not an accident —
it is what makes "who can open this course?" answerable in one place. Adding a fifth is not a
deviation in itself, but it is the kind of addition that erodes the structure if taken casually,
which is why FR-007 states the constraint as a requirement rather than leaving it to whoever builds
it.

---

## Out of scope

- Certificates, scores, grades or any assessment beyond the existing completion.
- Employees choosing their own tracks, or requesting one.
- Tracks that branch, or depend on a role change, or expire.
- Applying deadlines to courses that are not on a track.
- Any change to how a course itself is built, published or audienced.
