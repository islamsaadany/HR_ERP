# Feature Specification: Learning Track — Courses, Assignment & Tracked Progress

**Feature Branch**: `claude/lms-section-repo-review-meb9cj`

**Created**: 2026-08-21

**Status**: Draft — clarifications resolved 2026-08-21, ready for `/speckit-plan`

**Input**: User description: "Learning Track (LMS) as an HR_ERP module — port of the FFLMS platform, first slice. Add a Learning module to HR_ERP so HR can publish structured training courses and assign them to employees, and employees can work through them with tracked progress."

**Provenance**: Adapted from `ahmedgalal-lang/FFLMS` (confirmed ours to reuse, 2026-08-21). That
codebase supplies the domain design and a small set of pure logic modules; its identity model,
public catalog, instructor role, and UI are **not** carried over. See *Assumptions → Provenance*.

**Supersedes**: the Phase-9 "Learning Track placeholder" line in `IMPLEMENTATION_PROGRESS.md`.
This is that phase, built for real.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a course and let employees complete it (Priority: P1)

An HR Admin builds a training course in the admin area: they name it, add sections, add lessons
inside each section, and fill each lesson with content — a video, formatted text, or a downloadable
file. While they work, the course is a draft that no employee can see. When it is complete, they
publish it. Every active employee then finds it under Learning, opens it, works through the lessons
in order, marks each one done, and watches a progress figure climb until the course is complete.

**Why this priority**: This is the whole product in miniature. Without it there is no content and
nothing to learn from; with only this, HR can already publish company-wide training and see people
finish it. Everything else in this spec narrows *who* sees a course or tightens *how* completion is
earned — both are refinements of this loop.

**Independent Test**: Sign in as HR, build a two-section course with four lessons (one video, one
text, one file, one optional), publish it. Sign in as an employee, open the course, complete the
three required lessons, and confirm the course reports itself complete. Confirm a second employee
who has done nothing sees it at 0%.

**Acceptance Scenarios**:

1. **Given** an HR Admin is building a course, **When** it has not been published, **Then** no
   employee can see it anywhere in Learning, and opening its address directly does not grant access.
2. **Given** a course whose sections or lessons are empty, **When** the HR Admin tries to publish it,
   **Then** publication is refused and the specific gap is named (a section with no lessons, or a
   lesson with no content).
3. **Given** a published course, **When** an employee opens it for the first time, **Then** they land
   on its first lesson and their progress reads 0%.
4. **Given** an employee has completed some lessons and left, **When** they return to the course
   later, **Then** they resume at the first lesson they have not completed.
5. **Given** an employee completes the last required lesson, **When** the completion is recorded,
   **Then** the course is marked complete for them, with the date it happened, without any further
   action.
6. **Given** a course contains optional lessons, **When** progress is calculated, **Then** only
   required lessons count toward the percentage, and a course whose lessons are all optional reads
   as complete.
7. **Given** an employee has completed lesson B, **When** HR later reorders the lessons or renames
   them, **Then** that employee's completed lessons and percentage are unchanged.

---

### User Story 2 - Assign a course to the right people (Priority: P2)

Not every course is for everyone. When creating a course, HR chooses whether it is open to all
employees or restricted. A restricted course reaches people by two routes: an **audience** drawn
live from the employee registry — a department, a business unit, an employment type, a tenure band,
everyone reporting to a named manager, or all employees — or a named **group** HR builds by hand for
a one-off cohort such as "2026 new joiners". A person can be reached by several routes at once.
Because audiences and group membership are read live, a new joiner who matches an audience picks up
its courses without anyone doing anything.

**Why this priority**: This is what makes the module usable for real training obligations rather
than a shared video library. It is second because US1 is demonstrable and valuable without it — a
course open to everyone already works.

**Independent Test**: Restrict a course and give it the audience "Consulting department". Confirm a
Consulting employee sees it and a Finance employee cannot, including by direct link. Add the Finance
employee to a group, assign the same course to that group, and confirm they now see it. Remove the
group's assignment and confirm they lose it while the Consulting employee keeps it.

**Acceptance Scenarios**:

1. **Given** a restricted course with no routes to a given employee, **When** that employee browses
   Learning or opens the course's address directly, **Then** the course is invisible and
   inaccessible, and the refusal is decided on the server.
2. **Given** a restricted course assigned to the audience "Consulting", **When** a new employee is
   created in Consulting, **Then** that course appears for them with no further action by HR.
3. **Given** an employee reached by both a direct assignment and a group, **When** HR removes the
   group's assignment, **Then** the employee keeps access through the direct assignment.
4. **Given** an employee's only route to a course is removed, **When** they next open Learning,
   **Then** the course is gone from their list and their recorded progress on it is retained, not
   deleted.
5. **Given** HR assigns a course to a group that already has it, **When** the assignment is repeated,
   **Then** nothing is duplicated and no one's progress is disturbed.
6. **Given** an employee whose department, business unit, employment type, or tenure band is not set,
   **When** audiences are evaluated, **Then** they are simply not matched by audiences that key on
   the missing field, and nothing errors.
7. **Given** an employee's status changes to LEFT, **When** audiences are evaluated, **Then** they
   drop out of every audience and appear in no assignment roster, while their history is retained.

---

### User Story 3 - Make sure the video was actually watched (Priority: P3)

For training that has to be genuinely consumed rather than clicked past, HR can require that a set
percentage of a lesson's video is watched before the lesson can be marked complete, and can place
checkpoint questions at chosen moments in the video — playback pauses and the learner must answer
before it continues. Watched time only ever counts forward: skipping ahead earns nothing, and
rewinding to rewatch never reduces what has already been credited.

**Why this priority**: It converts "assigned" into "actually completed", which is the difference
between a training record that means something and one that does not. It is third because a course
is fully usable without it — the gate defaults to off.

**Independent Test**: Set a lesson to require 80% watched and add one checkpoint at 30 seconds. As an
employee, skip to the end and confirm the lesson cannot be marked complete. Play from the start and
confirm playback pauses at 30 seconds until the question is answered. Watch past 80% and confirm the
lesson can then be completed. Rewind and confirm the credited figure does not drop.

**Acceptance Scenarios**:

1. **Given** a lesson requiring 80% watched, **When** the learner has watched less, **Then** the
   completion control is unavailable and states how much is left.
2. **Given** a learner drags the playhead forward past unwatched material, **When** watched time is
   calculated, **Then** the skipped span is not credited.
3. **Given** a learner rewinds and rewatches, **When** watched time is recorded, **Then** the credited
   total does not decrease.
4. **Given** a checkpoint at a given moment, **When** playback reaches it, **Then** the video pauses,
   the question is shown, and playback resumes only once it is answered.
5. **Given** a learner closes the browser mid-video, **When** they reopen the lesson, **Then**
   playback resumes at approximately the position they left, with previously credited watched time
   intact.
6. **Given** HR supplies a video the platform cannot measure (a Google Drive link), **When** they try
   to set a watch requirement or add a checkpoint on that lesson, **Then** the platform refuses and
   explains that this video source cannot be tracked — it must never appear to be enforcing a rule
   it cannot enforce.

---

### User Story 4 - See who has completed what (Priority: P4)

HR opens a published course and sees the people it currently reaches, each with their progress and,
where finished, the date they finished — so an unfinished obligation is visible without asking
anyone. The list keeps itself current while it sits open.

**Why this priority**: Assignment without visibility is a filing cabinet. It is last because the
three stories above must exist before there is anything to report on, and because the reporting here
is deliberately minimal — richer analytics are deferred.

**Independent Test**: With a course assigned to five people of whom two have finished, open the
course roster as HR and confirm it shows five rows, two complete with dates in dd/mm/yyyy, three
in progress with percentages. Complete a third person's course in another browser and confirm the
roster updates without a manual reload.

**Acceptance Scenarios**:

1. **Given** a course reaching several employees, **When** HR views its roster, **Then** every
   currently-reached employee appears with their progress percentage and completion date if any.
2. **Given** the roster is open, **When** someone's progress changes elsewhere, **Then** the view
   reflects it without the operator reloading the page.
3. **Given** an employee who lost access but has recorded progress, **When** HR views the roster,
   **Then** that person is not listed among current participants but their history is not destroyed.

---

### Edge Cases

- **Curriculum edited after people started.** Renaming or reordering lessons must not disturb anyone's
  completions or percentage. Removing a required lesson recalculates everyone's percentage over what
  remains — which can push a learner to 100%. Adding a required lesson to a course someone has
  already completed prompts the author for a decision (FR-039) rather than resolving silently.
- **Access lost mid-course.** An employee moves department and their only route to a half-finished
  course disappears. They keep access until they finish it (FR-042) — being mid-course is itself a
  route. Someone who had **not** started loses it immediately, progress rows and all retained.
- **Reopening meets grandfathering.** A completed course is reopened by FR-039 for someone who has
  since lost every route to it. Reopening does not draw them back in (FR-041): grandfathering
  protects work genuinely in progress, it does not resurrect a finished obligation.
- **Impersonation.** An admin using "View as employee" must never be able to record learning progress
  as that person — a training record must reflect what the employee actually did.
- **Empty and degenerate courses.** A course with no required lessons reads as complete. A section
  with no lessons blocks publication. A lesson with no content blocks publication.
- **Missing registry data.** Employees with no department, business unit, employment type, tenure
  band, or manager must not break audience evaluation or appear in audiences they don't match.
- **Leavers.** An employee set to LEFT drops out of every audience and roster; their records remain.
- **Unplayable or removed media.** A video whose file is missing must show a clear failure in the
  lesson rather than silently reporting zero progress forever.
- **Simultaneous sessions.** The same employee with the course open in two tabs must not end up with
  a lower credited watched time than the higher of the two.
- **Unpublishing.** Taking a published course back to draft hides it from every employee immediately;
  recorded progress survives so republishing restores everyone's place.
- **A person reached twice by the same audience** (e.g. matching both "Consulting" and "all
  employees") counts once, everywhere.

## Requirements *(mandatory)*

### Functional Requirements

**Authoring and structure**

- **FR-001**: The platform MUST let HR Admins and Super Users create, edit, and delete courses; no
  other role may author, and there is no instructor role.
- **FR-002**: A course MUST be structured as course → sections → lessons, with an explicit,
  editable order at each level.
- **FR-003**: A lesson MUST hold one or more content blocks, each being a video, formatted text, or a
  downloadable file, in an editable order.
- **FR-004**: Each lesson MUST be markable as required or optional, defaulting to required.
- **FR-005**: A course MUST exist in a draft state invisible to employees, and be explicitly
  published to become visible.
- **FR-006**: Publication MUST be refused for a course containing a section with no lessons or a
  lesson with no content, naming the specific gap.
- **FR-007**: A published course MUST be returnable to draft, hiding it from employees without
  destroying anyone's recorded progress.
- **FR-008**: Uploaded video and file content MUST be stored in the platform's existing file store.
- **FR-009**: HR MUST be able to supply a video as an uploaded file or as a link to a supported
  external source, and the platform MUST state plainly which sources it can measure playback on.
- **FR-039**: When an edit to a published course increases the set of lessons it requires — a new
  required lesson, or an optional one made required — and at least one employee has already
  completed that course, the platform MUST ask the author whether the course reopens for those
  employees, naming how many are affected. Neither outcome may be applied silently.
- **FR-040**: When the author chooses to reopen, the affected completions MUST be superseded rather
  than erased: the original completion date is retained alongside the date it was reopened, and the
  course returns to in-progress for those employees. When the author chooses not to reopen, those
  completions stand and the added lesson is not required of them.
- **FR-041**: Reopening MUST affect only employees the course currently reaches. An employee who
  completed the course and has since lost every route to it is not drawn back in.

**Access and assignment**

- **FR-010**: Each course MUST be either open to all active employees or restricted to people reached
  by an explicit route.
- **FR-011**: The platform MUST support assigning a restricted course to an audience derived live
  from the employee registry: a department, a business unit, an employment type, a tenure band,
  the people reporting to a named manager, or all employees.
- **FR-012**: The platform MUST support named groups with explicit, editable membership, and
  assigning a course to a group.
- **FR-013**: The platform MUST support assigning a course directly to one named employee.
- **FR-014**: Audience membership and group membership MUST be evaluated live, so registry changes
  and membership edits take effect without re-assignment.
- **FR-015**: When any one route to a course is removed, the platform MUST retain the employee's
  access if any other route still reaches them; this determination MUST come from a single shared
  derivation used by every read and write path.
- **FR-016**: Whether a person may see or open a course MUST be decided on the server on every read
  and every write; the client is never trusted, and a direct link to a course a person cannot reach
  MUST be refused.
- **FR-017**: Employees whose status is not active MUST be excluded from every audience and roster,
  with their records retained.
- **FR-018**: Assigning a course to a person or group that already has it MUST have no additional
  effect and MUST NOT disturb existing progress.
- **FR-019**: Losing access MUST NOT delete recorded progress.
- **FR-042**: An employee who has started but not completed a course MUST keep access to finish it
  after their last route is removed. This in-progress standing is itself a route for the purposes of
  FR-015, so the shared derivation — not a special case at the edges — is what grants it.
- **FR-043**: Access retained under FR-042 MUST end when the employee completes the course, or when
  HR explicitly withdraws it, and at no other time.
- **FR-044**: HR MUST be able to see who currently holds a course only because they are mid-course,
  and to withdraw that access individually, so "who can open this course" always has an answer.
- **FR-045**: An employee who had not started a course when their last route was removed MUST lose
  it immediately; grandfathering protects work in progress, not eligibility.

**Learning and progress**

- **FR-020**: Every active employee MUST have a Learning area listing the courses currently reaching
  them, showing each one's progress.
- **FR-021**: An employee MUST be able to open a course, move between its lessons, and mark a lesson
  complete.
- **FR-022**: Course progress MUST be the proportion of **required** lessons completed, and a course
  with no required lessons MUST read as complete.
- **FR-023**: Progress MUST be recorded against stable lesson identities, never lesson position, so
  reordering or renaming a curriculum can never alter anyone's recorded progress.
- **FR-024**: Reopening a course MUST return the employee to the first lesson they have not completed.
- **FR-025**: A course MUST be marked complete automatically, with the date, when its required
  lessons are all complete — no separate action by the employee or HR.
- **FR-026**: Learning progress MUST NOT be recordable while an admin is impersonating an employee.

**Video enforcement**

- **FR-027**: HR MUST be able to require that a set percentage of a lesson's video be watched before
  that lesson may be marked complete, defaulting to no requirement.
- **FR-028**: Credited watched time MUST only ever increase: seeking backward MUST NOT reduce it, and
  seeking forward MUST NOT credit unwatched material.
- **FR-029**: Playback position MUST be remembered so a learner resumes near where they stopped.
- **FR-030**: HR MUST be able to place checkpoint questions at chosen moments in a video; playback
  pauses at each and resumes only when the learner answers.
- **FR-031**: For video sources whose playback the platform cannot observe, the platform MUST refuse
  to accept a watch requirement or a checkpoint on that lesson and MUST explain why, rather than
  accepting a setting it cannot enforce.
- **FR-032**: Checkpoint answers are a comprehension device only — they MUST NOT be scored, stored as
  a grade, or affect completion beyond letting playback continue.

**Visibility for HR**

- **FR-033**: HR MUST be able to view, per published course, the employees it currently reaches with
  each one's progress and completion date.
- **FR-034**: Any HR view that people monitor MUST keep itself current while open rather than showing
  a figure captured when the page was drawn.
- **FR-035**: All dates shown to any user MUST be displayed as dd/mm/yyyy.
- **FR-046**: The course roster MUST distinguish employees reached by a current route from those
  retained only because they are mid-course, and MUST show a superseded completion's original date
  alongside the date it was reopened.

**Boundaries**

- **FR-036**: The module MUST use the existing employee registry as its only source of people and
  roles; it MUST NOT introduce its own accounts, sign-up, password handling, or role names.
- **FR-037**: There MUST be no self-enrolment, no public catalog, and no page reachable without
  signing in.
- **FR-038**: The module MUST send no email in this release.

### Key Entities

- **Course**: A unit of training. Title, description, cover image, category, draft/published state,
  open-or-restricted setting, and its ordered sections.
- **Course Section**: A named grouping of lessons within a course, with an order. *(Deliberately not
  called "Module" — that word already means an app area in this platform.)*
- **Lesson**: A single learning step within a section. Title, order, required-or-optional, an optional
  watch requirement, and its ordered content blocks.
- **Lesson Block**: One piece of a lesson's content — a video, formatted text, or a file.
- **Video Checkpoint**: A question attached to a lesson's video at a given moment, with its options
  and the expected answer, used only to pause and resume playback.
- **Course Audience**: A rule attached to a restricted course that names a slice of the employee
  registry (a department, business unit, employment type, tenure band, a manager's reports, or all
  employees), evaluated live rather than expanded into a stored list.
- **Learner Group**: A named, reusable set of employees with explicit membership, for cohorts that
  no registry field describes.
- **Course Assignment**: A grant of access to one course for one employee or one group, with who
  granted it and when, and whether it has been revoked.
- **Course Enrollment**: One employee's participation in one course — their overall percentage,
  when they started, when they completed it, whether that completion has since been superseded by
  added required content (and when), and whether their access is currently being retained only
  because they are mid-course.
- **Lesson Progress**: One employee's state on one lesson — whether and when it was completed, the
  last playback position, and the credited watched seconds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An HR Admin can build and publish a three-lesson course, from an empty course to
  visible-to-employees, in under 15 minutes without written instructions.
- **SC-002**: An employee reached by a course finds it and opens its first lesson within 30 seconds
  of signing in, with no more than two clicks from their home screen.
- **SC-003**: A newly created employee who matches an existing audience sees that audience's courses
  the first time they sign in, with no action taken by HR after the employee record was saved.
- **SC-004**: Reordering, renaming, or adding optional lessons in a course with active learners
  changes no learner's recorded percentage.
- **SC-005**: An employee who skips to the end of a gated video cannot mark that lesson complete,
  in 100% of attempts, including attempts made by manipulating the page.
- **SC-006**: An employee who is reached by two routes and loses one retains access in 100% of cases.
- **SC-007**: A course roster reflects a completion that happened elsewhere within one minute, with
  no manual reload.
- **SC-008**: No employee can reach a course they have no route to, including by direct link, in any
  attempt.
- **SC-009**: Zero learning progress rows are attributable to an impersonating admin.
- **SC-010**: An employee who is mid-course when their last route is removed can still reach and
  finish that course, in 100% of cases.
- **SC-011**: No completion is ever silently invalidated: every superseded completion retains its
  original date, and every reopening is traceable to an author's explicit choice.

## Assumptions

**Scope**

- The **only** things in this release are: authoring, publishing, assignment, the learning loop, video
  enforcement, and a minimal HR roster. **Deferred to later specs, named here so they are not
  forgotten**: quizzes and scored assessments, gradable assignments and submissions, certificates
  (including the Arabic-capable PDF), discussion boards, announcements and notifications, learner
  analytics and org-wide reporting, Excel export of rosters, recurring or expiring training,
  learning paths spanning several courses, and any manager-facing view of their team's progress.
- **Completion does not expire on a schedule** in this release — no annual refresh and no re-take
  cycle; compliance-style recurring training is a later spec. It can, however, be superseded when HR
  adds required content and chooses to reopen the course (FR-039), which is an editorial act by a
  person, not a timer.
- **Managers get no team view** in this release; visibility is HR-only. This is a deliberate
  narrowing — the org chart is available, so it is a small later addition.
- Course content is authored in the platform. Importing SCORM, xAPI, or any external course package
  is out of scope now and not designed for.

**Environment and reuse**

- The existing employee registry, roles, sign-in, impersonation, file storage, and branding are
  reused as-is. This feature adds no new environment variables and no scheduled job.
- The **supported video sources** are: files uploaded to the platform, YouTube, Vimeo, and any direct
  link to a video file — all of which can be measured — plus Google Drive links, which play but
  **cannot** be measured or gated. This distinction is a property of those services, not a choice.
- The employee-facing Learning area replaces the Phase-9 placeholder. It sits alongside Handbook and
  Knowledge rather than merging with them; a later decision may relate the three.

**Provenance**

- The design of this module is adapted from `ahmedgalal-lang/FFLMS`, confirmed as ours to reuse on
  2026-08-21. From it we take the domain structure and a small number of self-contained logic pieces
  — video-source classification, progress calculation, and access reconciliation — together with
  their tests. We do **not** take its identity model, its instructor role, its public catalog, or any
  of its interface, which is rebuilt in this platform's navy/gold design language under the usual
  mockup-first rule.

## Resolved Clarifications

Both questions raised at specification time were settled by the product owner on 2026-08-21.

- **Q1 — When required content is added to a course somebody already completed, does their
  completion stand?** → **HR chooses per edit.** The author is asked at the moment of the edit, told
  how many people it affects, and neither outcome happens silently. Reopened completions are
  superseded, not erased, and reopening reaches only people the course still reaches.
  *(FR-039, FR-040, FR-041, FR-046, SC-011.)*
- **Q2 — When an employee loses their last route to a course they are part-way through, do they keep
  access to finish it?** → **Yes, grandfathered until they finish.** Being mid-course is modelled as
  a route in its own right rather than an exception, so the single shared access derivation still
  answers every question. HR can see and withdraw such access, and an employee who had not started
  loses the course immediately. *(FR-042, FR-043, FR-044, FR-045, FR-046, SC-010.)*
