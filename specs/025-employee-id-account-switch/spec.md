# Feature Specification: Employee ID + Linked-Account Switching

**Feature Branch**: `claude/platform-name-demo-view-hxzd6l`

**Created**: 2026-08-14

**Status**: Draft (aligned with user; ready for `/speckit-plan`)

**Input**: A person holds two real contracts across two group companies. They are kept as **two independent employee records** with **two distinct company emails**. Add an **Employee ID** that identifies the person and links their accounts, and let them **switch between their linked accounts** quickly (re-authenticating once per switch). Interim toward the spec-022 "one identity, many employments" model.

## Overview

Some people work under **two contracts in two group companies** at once (e.g. part-time in one, full-time in another). Today the platform models **one `User` = one employee = one contract**, and there is no way to tell that two records are the same human or to move between them conveniently.

This feature keeps that simple model but adds a light **identity + convenience layer**:

- An **Employee ID** on each employee record — a person identifier, HR-managed and optional. A person with two contracts is entered as **two records that share the same Employee ID**; that shared value is what marks them as the same human. **Emails stay distinct and remain the per-account login** — the login model does not change.
- An **account switcher**: when a signed-in user's account shares its Employee ID with other active accounts, the app offers a **"Switch account"** control listing those linked accounts. Selecting one goes to sign-in with that account's email pre-filled; the user enters **that account's password once** and lands in it.

Each linked account stays **fully independent** — its own business-unit brand, employment type, tenure, salary, benefits, time-off, and documents. Linking never merges or shares data; it is purely identity + navigation. The full **one-identity-many-employments** model (a single person entity with multiple employment records and an active-contract context) remains the **spec-022** goal; this is the lightweight interim that makes the one known dual-contract case work today.

## Clarifications

### Session 2026-08-14

- Q: One shared email or two? → A: **Two distinct emails** (one per company). Email stays the unique per-account login; duplicate emails are NOT allowed and the login-by-email model does not change.
- Q: Switching without a password, or ask each time? → A: **Ask once per switch** — each switch re-authenticates with the target account's own password. No simultaneous multi-session, no password-less hopping.
- Q: Is Employee ID globally unique? → A: **No** — it identifies the person, so a person's two accounts intentionally share it. On saving a duplicate, HR is warned that it links the two accounts and must confirm.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR gives a dual-contract person one Employee ID across two records (Priority: P1)

HR creates (or edits) the person's two employee records — one per company, each with its own email, employment type, and business unit — and sets the **same Employee ID** on both. When HR saves the second record with an Employee ID that already exists, the system **warns that this links the two accounts as the same person** and asks HR to confirm before saving.

**Why this priority**: The Employee ID is the anchor for everything else — without it there is no link and no switcher.

**Independent Test**: Create two employee records with two emails and the same Employee ID. Confirm both save, the linking warning appeared on the second, and both records show the Employee ID. Give a third unrelated record a *different* Employee ID and confirm no warning and no link.

**Acceptance Scenarios**:

1. **Given** the employee form/grid, **When** HR sets an Employee ID that no other record uses, **Then** it saves with no warning and links nothing.
2. **Given** an Employee ID already used by another active record, **When** HR saves it onto a second record, **Then** the system warns "this links these accounts as the same person" and only proceeds on confirmation.
3. **Given** the CSV import/export, **When** HR fills the Employee ID column, **Then** it round-trips like department/business-unit (a value that would link accounts is reported in the per-row results).

### User Story 2 - An employee switches between their linked accounts (Priority: P1)

Signed into her Forefront Consulting account, the person sees a **"Switch account"** control listing her **Visual Shift** account (name + business unit). She selects it, is taken to sign-in with the Visual Shift email pre-filled, enters that account's password, and lands in the Visual Shift account — with its own brand, benefits, and data. Switching back works the same way.

**Why this priority**: This is the "easy access" the person needs day to day.

**Independent Test**: With two linked accounts, sign into one, open "Switch account", pick the other, enter its password, and confirm you're now in the other account (its brand/name/data). Confirm an account with no shared Employee ID shows no switcher.

**Acceptance Scenarios**:

1. **Given** I am signed into an account whose Employee ID is shared with ≥1 other active account, **When** I open the account menu, **Then** I see a "Switch account" list of those linked accounts (name + business unit) and no others.
2. **Given** I pick a linked account to switch to, **When** the sign-in page opens, **Then** that account's email is pre-filled and I complete sign-in by entering **its** password.
3. **Given** I am signed into an account with no shared Employee ID (or none set), **When** I open the account menu, **Then** there is no "Switch account" control.
4. **Given** a linked account that is not active (has left), **When** I view the switcher, **Then** it is not offered.

### Edge Cases

- **No Employee ID / unique Employee ID** → no link, no switcher (the overwhelming majority of employees).
- **Accidental duplicate** → the save-time warning + confirm prevents silently linking two different people; if it happens, HR clears the Employee ID on one record to unlink.
- **More than two linked accounts** → the switcher lists all other active accounts sharing the Employee ID.
- **A linked account is deactivated (left)** → dropped from the switcher.
- **Password entry** → switching always requires the target account's own password; a wrong password just fails sign-in as normal. No account the person isn't linked to is ever shown or reachable via the switcher.
- **Impersonation** → unaffected and separate; the switcher is the person's own linked accounts, not admin impersonation.
- **Employee ID is not a login credential** → it never replaces email/password for signing in; it only marks identity and drives the switcher.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add an **Employee ID** field to the employee record — HR-managed, optional, and **not globally unique** (a person's multiple accounts may share it).
- **FR-002**: HR MUST be able to set the Employee ID on the admin employee **create/edit form**, the **registry grid**, and **CSV import/export**, consistent with how department/business-unit are handled.
- **FR-003**: When HR saves an Employee ID that already exists on another record, the system MUST **warn that this links the accounts as the same person** and require explicit confirmation before saving.
- **FR-004**: The system MUST treat two or more **active** accounts sharing the same Employee ID as **linked accounts of one person**, without merging or sharing any of their data.
- **FR-005**: When a signed-in user's account shares its Employee ID with ≥1 other active account, the app MUST show a **"Switch account"** control listing those linked accounts (at least name + business unit), and MUST NOT list any account that does not share the Employee ID.
- **FR-006**: Selecting a linked account MUST take the user to sign-in with that account's **email pre-filled**, and completing sign-in MUST require **that account's own password** (re-authenticate once per switch). There is **no** simultaneous multi-session and **no** password-less switching.
- **FR-007**: The Employee ID MUST NOT become a login credential or change the existing **email + password** sign-in; email remains the unique per-account login identity and duplicate emails remain disallowed.
- **FR-008**: Linked accounts MUST remain fully independent — each keeps its own business-unit brand, employment type, tenure, salary, benefits, time-off, and documents; the switcher changes only **which account you are signed into**, never data.
- **FR-009**: The switcher MUST exclude inactive (left) accounts and MUST never expose an account the person is not linked to.

### Key Entities

- **Employee (User)**: gains an optional **Employee ID** (person identifier; may be shared across that person's accounts). Everything else unchanged; email remains the unique login.
- **Linked account set**: the set of active employee records sharing one Employee ID — a derived grouping (not merged data) used to drive the switcher.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can set up a dual-contract person (two records, two emails, one shared Employee ID) in under 5 minutes, and is warned before the second save links the accounts.
- **SC-002**: A person with two linked accounts can switch from one to the other — including entering the target password — in under 30 seconds, without an admin.
- **SC-003**: 100% of accounts with no shared Employee ID show **no** switcher and behave exactly as today (zero change for ordinary employees).
- **SC-004**: The switcher never lists or grants access to an account that does not share the viewer's Employee ID (verified by attempting to reach a non-linked account through it — impossible), and every switch requires the target account's password.
- **SC-005**: Linked accounts remain independent — switching shows the other account's own brand, benefits, and data with nothing merged.

## Assumptions

- Email + password sign-in (spec 001) is reused as-is for the switch; no new authentication mechanism is introduced and the domain/login rules are unchanged.
- Employee ID is a free-text HR-entered value (e.g. an HR system number); the system does not generate it. Matching for linking is exact (trimmed).
- The dual-contract population is tiny (one known person today); the design favors simplicity over a full identity model. The complete one-person-many-employments model stays a **spec-022** goal, into which Employee ID naturally feeds.
- Employee ID is HR-managed and shown on the employee's own profile as read-only; it is not confidential like salary, and not surfaced in the Team Directory (consistent with other HR-managed identifiers) unless decided later.
- Switching is a normal sign-in to the other account, so all existing sign-in behavior (temp-password gate, must-change-password, etc.) applies to the target account as usual.
