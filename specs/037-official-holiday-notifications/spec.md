# Feature Specification: Official Holidays — Verification, Bridges & Team Vacation Notifications

**Feature Branch**: `claude/official-holidays-vacation-notifications-x3zpbl`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Official holidays management with verification, bridge detection, and team vacation notifications (extends the Time-Off module, spec 035). HR can fetch the announced official holidays for the year from an online source, review and confirm them into the official holidays log. Each holiday keeps an original date and an actual (observed) date HR can adjust when the government moves it. Ahead of each holiday HR is reminded to verify the date. For verified upcoming holidays the platform prepares a warm, bilingual (English + Arabic) announcement to the whole team — highlighting bridges and long weekends — which HR reviews, edits, and sends. From the announcement, employees can start a pre-filled time-off request for the suggested bridge days, flowing through the normal manager-approval path. Company-declared breaks are explicitly parked (out of scope)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR builds and maintains the official holidays log (Priority: P1)

At the start of the year (or any time), an HR Admin opens the holidays screen inside the Time-Off admin area and fetches the announced official holidays for a chosen year from an online public-holidays source. The fetched list shows each candidate holiday's date, weekday, and name, clearly marked as suggestions. HR selects which ones to confirm; only confirmed holidays are stored in the official holidays log. HR can also add a holiday manually (no online source involved), rename one, or remove one. Each stored holiday carries its **original (announced) date** and its **actual (observed) date** — initially the same. When the government moves a holiday, HR adjusts the actual date; the original date remains visible as history. Working-day counting everywhere in Time-Off treats the **actual** date as the non-working day.

**Why this priority**: The holidays log with original/actual dates is the data backbone every other story reads. Verification, announcements, bridges, and one-click requests are all meaningless without it — and the existing working-day engine must count the right (actual) dates.

**Independent Test**: Fetch a year's holidays, confirm a subset, add one manually, move one to a different actual date — then create a time-off request spanning the moved holiday and confirm the working-day count excludes the actual date, not the original one.

**Acceptance Scenarios**:

1. **Given** an HR Admin on the holidays screen, **When** they fetch holidays for a year, **Then** they see a suggestion list (date, weekday, name) and nothing is stored until they confirm individual entries.
2. **Given** a fetched suggestion list containing a date already in the log, **When** the list renders, **Then** that entry is marked as already recorded and cannot be duplicated.
3. **Given** a stored holiday, **When** HR moves its actual date to another day, **Then** the holiday shows both dates (original + actual), its status becomes "moved", and working-day counting immediately treats the new actual date (and no longer the original date) as non-working.
4. **Given** the online source is unreachable or returns nothing for the requested year, **When** HR fetches, **Then** a clear message explains the fetch failed and HR can still add holidays manually.
5. **Given** holidays that existed before this feature, **When** the feature ships, **Then** each existing holiday appears with original = actual = its stored date and continues to count exactly as before.

---

### User Story 2 - HR is reminded to verify each holiday before it arrives (Priority: P2)

Each holiday has a verification status: **tentative** (default for newly confirmed entries, especially moon-dependent ones), **verified** (HR confirmed the date holds), or **moved** (HR adjusted the actual date). A configurable lead time (default 14 days before the actual date) defines each holiday's verification window. When a holiday that is still tentative enters its window, the platform reminds HR — an email to the HR inbox plus an in-app indication on the admin holidays screen — asking "is this still the right date?". HR then either verifies it as-is, moves it to a new actual date, or leaves it pending (the reminder is not repeated daily; one reminder per holiday per window).

**Why this priority**: The verification step is what makes announcements trustworthy — fixed holidays are a formality, but moon-dependent ones genuinely change, and telling the whole company a wrong date is worse than telling them nothing.

**Independent Test**: Set a holiday's actual date to be within the lead time, run the daily check, and confirm exactly one HR reminder is produced and the holiday is flagged for verification on the admin screen; verify it and confirm no further reminders occur.

**Acceptance Scenarios**:

1. **Given** a tentative holiday whose actual date is 14 days away (default lead time), **When** the daily check runs, **Then** HR receives one verification reminder and the holiday is visibly flagged "needs verification" in the admin area.
2. **Given** a holiday already verified, **When** the daily check runs inside its window, **Then** no reminder is sent.
3. **Given** a reminder already sent for a holiday, **When** the daily check runs again the next day and the holiday is still tentative, **Then** no duplicate reminder is sent for that holiday's window.
4. **Given** HR moves a tentative holiday's actual date during verification, **Then** its status becomes "moved" and it is treated as date-confirmed (no further verification nagging for that occurrence).
5. **Given** the lead time setting is changed by HR, **When** the next daily check runs, **Then** the new lead time governs which holidays are in their window.

---

### User Story 3 - HR reviews and sends a warm bilingual team announcement (Priority: P2)

For an upcoming date-confirmed (verified or moved) holiday, the platform prepares an announcement draft: subject and body in **English first, then Arabic**, in a warm, encouraging tone — a break is coming; rest, travel, spend time with family, and come back recharged — with the explicit framing that this assumes the employee has the capacity and nothing critical or urgent on their plate (taking the break is their responsible call). The draft automatically names the holiday and its date(s) and calls out what the calendar around it offers: a **bridge** (exactly one working day between non-working days), a **long weekend** (the holiday adjoining the Friday+Saturday weekend into 3+ consecutive days off), or a plain single day. HR reviews the draft, can edit any of the text, and clicks Send. The announcement goes by email to all active employees, and an upcoming-holiday banner appears on the employee dashboard (the banner works even when email is not configured). The platform records what was sent, by whom, and when; the same holiday occurrence is not accidentally announced twice. Fixed, verified holidays may be announced well in advance; the platform never sends an announcement on its own.

**Why this priority**: This is the heart of the idea — proactively caring for people's rest with enough notice to plan travel. It depends on Stories 1–2 for trustworthy dates.

**Independent Test**: Verify a holiday that creates a bridge, open its prepared announcement, confirm the draft is bilingual, warm, names the bridge day, is editable, and on Send reaches all active employees while the dashboard shows the banner; confirm a second Send attempt for the same occurrence warns it was already sent.

**Acceptance Scenarios**:

1. **Given** a verified holiday with exactly one working day between it and the weekend, **When** HR opens the prepared announcement, **Then** the draft (English then Arabic) names the holiday, its date, and the bridge day, and suggests taking the bridge to make a longer break.
2. **Given** a prepared draft, **When** HR edits the text and clicks Send, **Then** the edited version is what all active employees receive and what the sent log records (content, sender, time, recipient count).
3. **Given** an announcement already sent for a holiday occurrence, **When** HR opens it again, **Then** the platform shows it as sent and requires an explicit confirmation to re-send.
4. **Given** email is not configured or the notifications master toggle is off, **When** HR sends, **Then** no email goes out, HR is told why, and the dashboard banner still appears for employees.
5. **Given** an upcoming announced holiday, **When** an employee signs in, **Then** the dashboard shows a banner with the holiday name, date(s), and any bridge/long-weekend callout, which disappears after the holiday passes.
6. **Given** a tentative (unverified) holiday, **When** HR looks for its announcement, **Then** the platform requires verification first rather than offering a send.

---

### User Story 4 - Employee starts a pre-filled bridge request in one click (Priority: P3)

The announcement email and the dashboard banner include a call-to-action for the suggested bridge day(s): the employee lands on the normal time-off request form **pre-filled** with the suggested date(s). They can adjust the dates, add a note, and submit; the request flows through the completely standard path — manager approval via the current org chart — and, once approved, those days count toward the employee's yearly taken counter exactly like any other time off. If the employee already has a request covering those days, the platform shows that state instead of inviting a duplicate.

**Why this priority**: A convenience layer on top of Stories 1–3; the normal request form already works without it, so it lands last.

**Independent Test**: From a sent announcement with a bridge, follow the call-to-action as an employee, confirm the form arrives pre-filled with the bridge date, submit, approve as the manager, and confirm the day appears in the employee's taken count.

**Acceptance Scenarios**:

1. **Given** an announcement with a bridge day, **When** an employee follows its call-to-action, **Then** the request form opens pre-filled with the bridge date(s) and shows the working-day count as usual.
2. **Given** the pre-filled form, **When** the employee changes the dates before submitting, **Then** the request submits with the employee's dates (the suggestion is not binding).
3. **Given** an employee with an existing pending or approved request covering the bridge day, **When** they follow the call-to-action, **Then** they see the existing request's status instead of a duplicate pre-filled form.
4. **Given** a submitted bridge request, **When** the manager approves it, **Then** it behaves identically to any approved time-off request (taken counter, visibility, no special casing).

---

### Edge Cases

- HR moves a holiday's actual date after an employee's approved request overlapped the original date: working-day counts are always computed live from the current holiday log, so the employee's taken count adjusts automatically; the request's date range itself never changes.
- HR moves a holiday's actual date onto a Friday/Saturday: allowed (governments do this); the day simply adds nothing to working-day exclusions, and announcement drafts describe the calendar honestly (no invented bridge).
- Two holidays with the same actual date (e.g., one moved onto another): the log prevents two entries occupying the same actual date and asks HR to resolve.
- A holiday spanning multiple days (e.g., Eid) arrives from the online source as several single-day entries: each is confirmed and tracked individually, but the announcement for adjacent holiday days presents them as one break.
- The bridge day itself is later declared a holiday: it stops being a bridge; a not-yet-sent draft reflects the new calendar, and an already-sent announcement is simply history (no retraction).
- The online source's predicted date for a moon-dependent holiday differs from the government's eventual announcement: this is the normal moved flow — the fetch stores the prediction as tentative original date; HR moves/verifies within the window.
- Verification lead time set longer than the gap to an imminent holiday (e.g., holiday in 3 days, lead 14): the holiday is already inside its window — flagged and reminded immediately on the next daily check.
- An employee joins after an announcement was sent: they see the dashboard banner (it reads live state) even though they never got the email.
- The daily check is missed for a day (platform hiccup): the next run catches up — windows are computed from dates, not from "was yesterday processed".
- Fetching a year already fully recorded: every suggestion shows as already recorded; confirming nothing is a valid outcome.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: HR Admins MUST be able to fetch the announced official holidays for a chosen year (current country: Egypt) from an online public-holidays source, presented as a suggestion list (date, weekday, name) — nothing is stored without explicit per-entry HR confirmation.
- **FR-002**: HR Admins MUST be able to add, rename, and remove holidays manually, independent of the online source. Removal MUST warn that past-dated removals change historical working-day counts.
- **FR-003**: Every holiday MUST carry an original (announced) date and an actual (observed) date, initially equal; HR Admins MUST be able to change the actual date while the original remains visible.
- **FR-004**: All working-day counting (request working-day totals, yearly taken counters, zero-working-day refusal, form previews) MUST treat the actual date as the non-working day. Holidays existing before this feature MUST carry over with original = actual = their stored date and unchanged counting behavior.
- **FR-005**: Every holiday MUST have a verification status — tentative, verified, or moved — defaulting to tentative when confirmed from the online source. Manually added holidays default to verified (HR typed them deliberately).
- **FR-006**: The platform MUST run an automatic daily check that (a) flags tentative holidays entering their verification window (configurable lead time, default 14 days before the actual date) and sends HR one reminder per holiday per window, and (b) surfaces date-confirmed upcoming holidays whose announcement has not yet been sent. The daily check MUST NOT send team announcements on its own.
- **FR-007**: HR Admins MUST be able to resolve a verification by confirming the date (verified) or adjusting the actual date (moved); either outcome ends the reminder nagging for that occurrence.
- **FR-008**: For an upcoming date-confirmed holiday, the platform MUST prepare an editable announcement draft in English followed by Arabic, in a warm and encouraging tone that invites rest, travel, and family time, and frames taking the break as the employee's responsible call assuming nothing critical or urgent is on their plate.
- **FR-009**: The draft MUST automatically describe the calendar around the holiday: bridge days (exactly one working day between two non-working days, per the Friday+Saturday weekend and the holiday log), long weekends (3+ consecutive days off formed with the weekend), and consecutive holiday days presented as one break.
- **FR-010**: HR Admins MUST be able to edit the draft and explicitly send it; sending emails all active employees and records a sent log (final content, sender, time, recipient count). Re-sending the same holiday occurrence MUST require explicit confirmation.
- **FR-011**: Announcement and reminder emails MUST follow the platform's established email posture: configuration-gated, never blocking or failing the triggering action, and honoring the notifications master toggle. Employees without a working email setup are not a send failure — the dashboard banner covers them.
- **FR-012**: The employee dashboard MUST show a banner for the next announced upcoming holiday — name, date(s), bridge/long-weekend callout — independent of email configuration, disappearing once the holiday has passed.
- **FR-013**: The announcement email and dashboard banner MUST offer a call-to-action that opens the standard time-off request form pre-filled with the suggested bridge/extended date(s); the employee can adjust the dates freely, and the submitted request follows the completely normal manager-approval flow and yearly taken counting. If the employee already has a pending or approved request covering the suggested days, the platform MUST show that request's state instead of a fresh pre-filled form.
- **FR-014**: Only HR Admins (and Super Users) may fetch, confirm, edit, verify, move, or announce holidays; employees only ever see the published calendar, banners, emails, and the request call-to-action.
- **FR-015**: The verification lead time MUST be configurable by HR in the admin area, defaulting to 14 days.

### Key Entities

- **Holiday (extended)**: An official public holiday occurrence — name, original date, actual (observed) date, verification status (tentative / verified / moved), where it came from (online fetch vs. manual), and when it was confirmed/verified. Actual dates are unique across the log.
- **Holiday Announcement**: The prepared-and-sent communication for one holiday occurrence (or one contiguous run of holiday days) — bilingual subject/body as sent, sender, sent time, recipient count, and the bridge/long-weekend callouts it contained.
- **Verification Reminder record**: The fact that HR was reminded about a holiday's window (per occurrence), preventing duplicate nagging.
- **Notification settings (extended)**: The existing notification configuration gains the holiday workflow — verification lead time and the holiday announcement/reminder sends live behind the same master toggle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can go from an empty year to a confirmed official-holidays log in under 5 minutes using the fetch-and-confirm flow, without typing dates by hand.
- **SC-002**: 100% of time-off working-day counts reflect a holiday's actual (observed) date within one page load of HR moving it — no stale counts anywhere Time-Off displays days.
- **SC-003**: For every tentative holiday, HR receives exactly one verification reminder per occurrence, at least the configured lead time before the holiday (given the platform was reachable that day).
- **SC-004**: Every announcement reaching employees was explicitly reviewed and sent by a human — zero auto-sent team announcements.
- **SC-005**: Employees can go from reading an announcement to a submitted bridge request in under 1 minute, with the dates already filled in.
- **SC-006**: An announced upcoming holiday is visible to 100% of active employees via the dashboard banner, including employees hired after the email went out.

## Assumptions

- **Online source**: the free public Nager.Date service is the agreed suggestion source for Egyptian holidays (aligned 2026-08-19). It is suggestion-only; HR confirmation is the sole write path, so a wrong prediction can never leak into working-day math. If the service disappears, manual entry remains fully sufficient.
- **Email policy widening (decision reversal, aligned 2026-08-19)**: the spec 020 rule "email limited to the benefit-claim workflow" is explicitly widened to also cover this holiday/vacation workflow (HR verification reminders + team announcements). Same guardrails: configuration-gated, fire-and-forget, behind the Admin → Notifications master toggle. The constitution and CLAUDE.md must be amended alongside implementation (constitution amendment requires user approval — this alignment is that approval).
- **Scheduling**: this feature introduces the platform's first scheduled daily check (planned as a Vercel Cron job — the app's first). Its only powers are flagging/reminding HR and keeping the "needs announcement" queue fresh; it never emails employees.
- **Bridge definition**: exactly one working day sandwiched between non-working days (aligned: "1 day is the classic"). Two-working-day gaps are not bridges and are not called out.
- **Weekend**: Friday + Saturday, fixed (spec 035 decision, 2026-08-18).
- **Language**: announcements are English first, then Arabic, in one message. The platform drafts both; HR is responsible for the final wording of each (the platform does not verify HR's edits are faithful translations of each other).
- **Audience**: announcements go to all active employees across the company — no per-team or per-business-unit targeting in this version.
- **Out of scope (parked by explicit user decision, 2026-08-19)**: company-declared breaks ("this whole week is off"). Recorded intent for when it returns: HR declares the break, employees do NOT file requests for those days, and the days at most appear in an informational counter — never through the request/approval flow.
- **Out of scope**: entitlement/limit math (spec 035's "counts inform, never block" stance is unchanged), retracting or editing an already-sent announcement, per-employee opt-out of announcement emails, and non-Egypt holiday calendars.
