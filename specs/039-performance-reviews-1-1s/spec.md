# Feature Specification: Performance Reviews & 1:1s

**Feature Branch**: `claude/team-log-reviews-1-1s-t0dugz`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Performance reviews & 1:1s. Quarterly review cycles (Q1–Q4, opened and closed automatically by the calendar — no operator, no admin screen). Four objects: a private running journal, 1:1 records with an outcome both sides acknowledge, a quarterly review sheet per manager↔report pair following the supplied PERFORMANCE REVIEW AGENDA template, and an agreed outcome that becomes the next quarter's carry-forward. Both halves of the sheet stay sealed until both parties submit. The sheet freezes when the meeting is marked held. HR views nothing here. No money data on this surface ever. Strengths come from an uploaded Gallup PDF."

**Agreed input**: `specs/_parked/performance-reviews-and-1-1s.md` — the source review template (verbatim),
the settled decisions, and the PDF parse rule validated against two real Gallup reports. That file is the
record of what was agreed; this spec is its product statement.

---

## Overview

Today a quarterly review is a document written the night before the meeting, which means it reports
whatever happened most recently rather than what happened over the quarter. This feature moves the
review onto the platform so it is **filled across the quarter**, so **both parties write before they
meet**, and so **what they agree survives to the next review**.

The module is deliberately **private to each manager↔report pair**. HR administers nothing here and
reads nothing here — no oversight screen, no completion reporting, no break-glass. It exists to make a
conversation better, not to supply anyone with a record of it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The quarterly review sheet (Priority: P1)

An employee and their manager each fill their own half of a quarterly review sheet before they meet.
Neither can read the other's half until both have submitted. When they meet, they see both halves side
by side, work through the agenda, and record an agreed outcome. That outcome opens the next quarter's
sheet, so the next review starts from what they last agreed.

**Why this priority**: This is the feature. Without it there is nothing to journal *toward* and nothing
for a 1:1 outcome to feed *into*. On its own it already replaces the document-the-night-before habit.

**Independent Test**: With only this story built, a pair can complete a full quarter review on the
platform and open the next quarter carrying their agreed priorities forward.

**Acceptance Scenarios**:

1. **Given** an open quarter and a manager↔report pair, **When** each opens their review sheet, **Then**
   each sees the full agenda (Reflections, Forward-Looking Expectations) and can fill and save their own
   half over time without submitting.
2. **Given** the employee has submitted and the manager has not, **When** the employee opens the sheet,
   **Then** they see their own half and a clear indication that the manager's half is sealed — no
   content, no partial content, no preview.
3. **Given** both parties have submitted, **When** either opens the sheet, **Then** both halves are
   fully visible to both.
4. **Given** both halves are open, **When** either party marks the meeting held, **Then** both halves
   become read-only and neither party can edit their answers afterwards.
5. **Given** the meeting is marked held, **When** either party writes the agreed outcome (top 3
   priorities, risks to watch, what would make the next review a success, commitments from each side),
   **Then** the other party can see it and must acknowledge it before it is final.
6. **Given** a finalised outcome for Q1, **When** the Q2 sheet is opened by either party, **Then** the
   Q1 outcome is shown on it as carry-forward, labelled as what was agreed last quarter.
7. **Given** a quarter closes with only one party submitted, **When** the quarter ends, **Then** both
   halves open as-is and the sheet freezes — a party who never submitted cannot keep the other's half
   sealed indefinitely.

---

### User Story 2 - The private running journal (Priority: P2)

Across the quarter, an employee jots short dated notes as things happen — a win, a blocker, something
they learned, something they want to raise. Nobody else can ever read them. When the review comes, they
choose which notes to carry onto their half of the sheet.

**Why this priority**: This is what makes the review honest — nobody remembers March in June. It is P2
rather than P1 only because the sheet must exist for a note to be promoted onto.

**Independent Test**: An employee can capture entries throughout a quarter and pull selected entries
onto their review sheet, with the unpromoted ones remaining invisible to everyone but them.

**Acceptance Scenarios**:

1. **Given** any employee, **When** they write a journal entry, **Then** it is saved with its date and
   an optional tag matching an agenda section (went well / didn't go well / learning / blocker /
   expectation).
2. **Given** an employee's journal, **When** their manager, an HR Admin, or a Super User views any
   surface in the product, **Then** no journal entry of another person is visible to them anywhere.
3. **Given** an open review sheet, **When** the employee promotes a journal entry, **Then** its text is
   copied onto the chosen section of their half of the sheet.
4. **Given** a promoted entry, **When** the employee later edits or deletes the original journal entry,
   **Then** the copy already on the sheet is unchanged.
5. **Given** a manager who is also someone's report, **When** they use their journal, **Then** it serves
   both their own review (as a report) and their reviews of their reports.

---

### User Story 3 - 1:1 records with an agreed outcome (Priority: P3)

A manager and a report do not wait for the quarter. When something needs a conversation, they hold a
1:1, capture what was discussed, and record an outcome both of them acknowledge. Those outcomes are
available at the quarterly review, and each party pulls forward the ones worth raising.

**Why this priority**: The 1:1 is what stops the quarter being the only moment anything gets resolved.
It depends on the pair relationship the review sheet establishes.

**Independent Test**: A pair can hold a 1:1 outside any review cycle, both acknowledge its outcome, and
find it available when their next quarterly sheet is assembled.

**Acceptance Scenarios**:

1. **Given** a manager↔report pair, **When** either party creates a 1:1 record, **Then** both can see it
   and both can add notes to it.
2. **Given** a 1:1 with notes, **When** one party writes the outcome, **Then** it is visible to the other
   and requires the other's acknowledgement.
3. **Given** both parties have acknowledged the outcome, **When** either opens the record, **Then** the
   notes and outcome are read-only.
4. **Given** an outcome one party has not acknowledged, **When** either opens the record, **Then** it
   remains editable and clearly marked as not yet agreed.
5. **Given** 1:1 outcomes recorded during Q2, **When** either party opens their Q2 review sheet, **Then**
   those outcomes are offered alongside the sheet and can be promoted onto it individually — none appear
   on the sheet unless promoted.
6. **Given** two employees who are not in a manager↔report relationship, **When** either attempts to
   start a 1:1 with the other, **Then** it is not possible.

---

### User Story 4 - Strengths from an uploaded Gallup report (Priority: P4)

The agenda asks which strengths a person relied on and which they misused. Rather than free text, each
employee has their own CliftonStrengths profile, taken from their Gallup report: their PDF is uploaded,
the themes are read out of it in rank order, a person confirms them, and from then on those questions
offer that person's own themes to choose from.

**Why this priority**: It sharpens two of the agenda's questions and makes the answers comparable across
quarters, but the review works without it.

**Independent Test**: Upload a Gallup report, confirm the extracted themes, and see them offered on the
strengths questions of that person's review sheet.

**Acceptance Scenarios**:

1. **Given** a Gallup **Top 5** report, **When** it is uploaded, **Then** exactly 5 themes are proposed
   in rank order.
2. **Given** a Gallup **CliftonStrengths 34** report, **When** it is uploaded, **Then** exactly 34 themes
   are proposed in rank order.
3. **Given** proposed themes, **When** they are reviewed, **Then** nothing is saved to the employee's
   profile until a person confirms them; they may correct the order or the themes before confirming.
4. **Given** a report the system cannot read, **When** the upload is processed, **Then** the failure is
   stated plainly and the themes can be entered by hand instead — a failed parse never blocks a profile.
5. **Given** an uploaded report, **When** the proposal is shown, **Then** the person's name and
   assessment date as printed in the report are displayed for confirmation, and the upload is never
   matched to an employee automatically on that basis.
6. **Given** an employee with a confirmed profile, **When** they answer "what strengths did you rely on
   most?" or "what strengths did you misutilise?", **Then** they choose from **their own** themes.
7. **Given** an employee with no profile, **When** they reach those questions, **Then** they can answer in
   free text.
8. **Given** an employee who retakes the assessment and uploads a new report, **When** the new profile is
   confirmed, **Then** answers already recorded on past sheets are unchanged.

---

### User Story 5 - The system pack (Priority: P5)

Alongside the two written halves, the review shows a short panel of facts the platform already holds
about the quarter, so the conversation starts from the same picture rather than from memory.

**Why this priority**: Useful context, but the review is complete without it and it is the piece most
likely to change once the pair has used it a few times.

**Independent Test**: Open a review sheet and see this quarter's platform facts for that employee,
without either party having typed them.

**Acceptance Scenarios**:

1. **Given** a review sheet for a quarter, **When** either party opens it, **Then** a panel shows the
   employee's working days taken in that quarter, their onboarding status while onboarding is still in
   progress, and their learning activity for that quarter.
2. **Given** the system pack, **When** it is displayed, **Then** it presents facts only — no score, no
   rating, no traffic light, no comparison to other employees.
3. **Given** any review or 1:1 surface, **When** it is displayed, **Then** it shows **no** benefits pool
   figures, claims, guaranteed benefits, medical commitments, or any other monetary value.

---

### Edge Cases

- **An employee with no manager** (the top of the org chart) has no pair, and therefore no review sheet
  and no 1:1s. They still have a private journal.
- **A manager with several reports** has one sheet per report each quarter, plus their own sheet as a
  report.
- **The reporting line changes mid-quarter**: the quarter's review is held with the manager the employee
  reports to at the moment the sheet is completed. Sheets and 1:1s written with a previous manager stay
  readable to the employee and to that previous manager only — a new manager never inherits access to
  them.
- **A party leaves the company mid-quarter**: the open sheet freezes as-is and stays readable to the
  remaining party; nothing chases anyone.
- **A quarter closes with a half-filled sheet and no meeting held**: it closes as-is and stays readable.
  Nothing chases anybody — chasing implies an overseer, and this module has none.
- **An employee joins mid-quarter**: they get that quarter's sheet like anyone else; there is no
  proration and no minimum tenure.
- **The parties disagree on an outcome**: the outcome cannot be acknowledged, so it stays editable and is
  shown as not yet agreed. There is no arbitration path and no escalation to HR.
- **A journal entry is promoted, then the original is edited or deleted**: the sheet keeps its copy.
- **The same 1:1 outcome is promoted by both parties**: it appears once per half, on each party's own
  half, not duplicated within a half.
- **A Gallup PDF is uploaded for the wrong person**: the name printed in the report is displayed at
  confirmation precisely so this is caught before saving.
- **A Gallup report contains a theme name the system does not recognise**: that entry is not proposed and
  the gap is stated, rather than a wrong theme being guessed.

---

## Requirements *(mandatory)*

### Functional Requirements

**Review cycles**

- **FR-001**: The system MUST run review cycles as calendar quarters (Q1–Q4), opening and closing on
  their own dates with no operator action.
- **FR-002**: The system MUST NOT provide any screen for opening, closing, extending, or reopening a
  cycle. There is no administrator of this module.
- **FR-003**: The system MUST create one review sheet per manager↔report pair per quarter, derived from
  the current org chart.

**The review sheet**

- **FR-004**: The review sheet MUST follow the agreed agenda: Reflections (what went well; what didn't
  go well; key learnings; mutual expectations review) and Forward-Looking Expectations (what you expect
  from the other party; alignment & commitments), with the questions recorded verbatim in the agreed
  input file.
- **FR-005**: The sheet MUST have two independently authored halves — one per party — with each party
  able to save drafts of their own half repeatedly before submitting.
- **FR-006**: The system MUST keep each half sealed from the other party until **both** halves are
  submitted, at which point both open to both parties.
- **FR-007**: The system MUST open both halves as-is when the quarter closes, whether or not both were
  submitted, so that one party's inaction cannot seal the other's half permanently.
- **FR-008**: A sealed half MUST reveal no content of any kind to the other party — not a preview, a
  summary, a word count, or a per-question completion state.
- **FR-009**: The system MUST freeze both halves as read-only once the meeting is marked held, and MUST
  allow either party to mark it held.
- **FR-010**: The agenda's wording MUST read as the period under review ("this period"), not "this
  year".

**The agreed outcome and carry-forward**

- **FR-011**: The system MUST allow an agreed outcome to be recorded after the meeting, covering top 3
  priorities for the next period, key risks or concerns to watch, what would make the next review feel
  like a success, and commitments from each side.
- **FR-012**: An outcome MUST require acknowledgement by both parties before it is final, and MUST be
  editable until then.
- **FR-013**: The system MUST display the previous quarter's finalised outcome on the current quarter's
  sheet, labelled as what was agreed last quarter.
- **FR-014**: A finalised outcome MUST remain readable to both parties in later quarters.

**The journal**

- **FR-015**: Every employee MUST have a private journal in which they can record short dated entries,
  each optionally tagged to an agenda section.
- **FR-016**: A journal entry MUST NOT be readable by any other person in any circumstance — not a
  manager, not an HR Admin, not a Super User, and not through any export, report, or search.
- **FR-017**: An employee MUST be able to promote a journal entry onto a section of their own half of an
  open review sheet.
- **FR-018**: A promoted entry MUST be an independent copy: later edits or deletion of the journal entry
  MUST NOT change what is on the sheet.

**1:1 records**

- **FR-019**: The system MUST allow a manager↔report pair to create a 1:1 record at any time,
  independently of any review cycle, and MUST NOT allow a 1:1 between any other pair of employees.
- **FR-020**: Both parties MUST be able to read and add notes to a 1:1 record they are part of.
- **FR-021**: A 1:1 outcome MUST require acknowledgement by both parties, and the record MUST become
  read-only once both have acknowledged.
- **FR-022**: The system MUST offer a quarter's 1:1 outcomes for promotion onto that quarter's review
  sheet, and MUST NOT place any of them on the sheet unless promoted.

**Strengths**

- **FR-023**: The system MUST hold the fixed CliftonStrengths vocabulary of 34 themes as reference data.
- **FR-024**: The system MUST hold, per employee, an ordered strengths profile of any length up to 34,
  covering both Top 5 and CliftonStrengths 34 reports without a separate setting.
- **FR-025**: The system MUST accept an uploaded Gallup report and propose the themes it finds, in rank
  order, resolved against the 34-theme vocabulary.
- **FR-026**: Proposed themes MUST NOT be saved without a person confirming them, and MUST be correctable
  before confirmation.
- **FR-027**: The system MUST allow the profile to be entered or corrected by hand, and MUST fall back to
  manual entry whenever a report cannot be read.
- **FR-028**: The system MUST display the name and assessment date printed in the uploaded report at the
  confirmation step, and MUST NOT use the printed name to match the report to an employee automatically.
- **FR-029**: The strengths questions on the review sheet MUST offer the answering employee's own themes,
  and MUST accept free text when that employee has no confirmed profile.
- **FR-030**: Replacing an employee's profile MUST NOT alter strengths answers already recorded on past
  sheets.

**Privacy and boundaries**

- **FR-031**: HR Admins and Super Users MUST have no access to review sheets, outcomes, 1:1 records, or
  journals — neither their contents nor their existence, and with no break-glass path.
- **FR-032**: The system MUST NOT provide oversight, compliance, completion, or analytics reporting over
  reviews or 1:1s to anyone.
- **FR-033**: Access MUST follow the pair: a person may read only the sheets, outcomes, and 1:1s they
  personally authored or were the counterpart to. Becoming someone's manager MUST NOT grant access to
  records written with a previous manager.
- **FR-034**: No monetary value of any kind — pool figures, claims, guaranteed benefits, medical
  commitments, salary — MUST appear on any surface in this module.
- **FR-035**: Every access decision above MUST be enforced on the server on every request, including on
  any route that serves an uploaded Gallup file, and MUST answer as though the record does not exist
  rather than confirming it exists to someone not entitled to it.

**System pack**

- **FR-036**: The review sheet MUST display a panel of facts the platform already holds for that employee
  and quarter: working days taken, onboarding status while onboarding is in progress, and learning
  activity.
- **FR-037**: The system pack MUST present facts only — no score, rating, ranking, or comparison between
  employees.

### Key Entities

- **Review cycle** — a calendar quarter. Has a start and end date and no owner; nobody opens or closes it.
- **Review sheet** — one per manager↔report pair per cycle. Holds two halves, each with a submitted state,
  a held-meeting state, and the pair it belongs to.
- **Sheet answer** — one party's answer to one agenda question on one sheet, including any promoted copies
  and any selected strengths themes.
- **Agreed outcome** — the record written after the meeting: priorities, risks, success definition, and
  each side's commitments. Acknowledged by both; becomes the next cycle's carry-forward.
- **Journal entry** — one employee's dated private note, optionally tagged to an agenda section. Belongs
  to its author alone.
- **1:1 record** — an ad-hoc meeting between a pair: notes from both, an outcome, and an acknowledgement
  from each party.
- **Strengths theme** — one of the fixed 34 CliftonStrengths themes; reference data, not per employee.
- **Employee strengths profile** — one employee's ordered list of themes, its source report, the
  assessment date, and who confirmed it.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pair can complete an entire quarterly review on the platform — both halves, the meeting,
  and the agreed outcome — without any document, file, or message outside the platform.
- **SC-002**: A person opening their review sheet sees what they agreed last quarter without searching for
  it, in a single view with no navigation away from the sheet.
- **SC-003**: Neither party can read any part of the other's half before both have submitted, verified by
  attempting to view it directly rather than only through the interface.
- **SC-004**: No account that is not one of the two parties — including the highest-privileged accounts in
  the product — can retrieve a review sheet, outcome, 1:1, or journal entry by any route.
- **SC-005**: A review sheet can be assembled from notes captured earlier in the quarter, such that
  entries written in the first month of a quarter are still available at the review with no re-typing.
- **SC-006**: Both supplied Gallup report formats produce a correct ordered profile — 5 themes from a
  Top 5 report and 34 from a CliftonStrengths 34 report — with no per-format choice made by the uploader.
- **SC-007**: A Gallup report that cannot be read still results in a complete profile within the same
  session, by hand.
- **SC-008**: No monetary figure appears anywhere in the module, verified across every screen it presents.

---

## Assumptions

- **The system pack contents are a first cut, not a settled list.** Working days taken, onboarding status,
  and learning activity were chosen because the platform already holds them and none is a performance
  judgement. Data-request responsiveness was deliberately excluded: it measures administrative chasing
  rather than work, and putting it in front of a manager turns a chore tracker into a character note.
  This list should be confirmed before planning.
- **Quarters follow the calendar year** (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), consistent with the
  time-off module's per-calendar-year counting.
- **"Manager" means the same thing here as everywhere else in the product**: the capability derived from
  the org chart (an employee with direct reports), not a role.
- **Reviews cover every employee who has a manager.** With HR unable to observe anything, a limited pilot
  would have no one to observe it, so there is no opt-in list.
- **Gallup reports contain personal assessment data** and are treated as personal documents belonging to
  the employee, stored the way the product already stores personal documents.
- **Departed employees' records stay readable to the remaining party** rather than being deleted, on the
  same basis the product retains other historical records.
- **No email or notification of any kind** is part of this feature. The product permits email in two
  workflows only (benefit claims and holidays); this is not one of them, and a reminder mechanism would
  in any case reintroduce the overseer this design excludes.
- **Nothing here reads or writes benefits, payroll, or any monetary record**, so no existing money rule
  or ceiling is affected.
