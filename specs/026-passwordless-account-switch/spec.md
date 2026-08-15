# Feature Specification: Password-less Switching Between Linked Accounts

**Feature Branch**: `claude/benefits-page-styling-3behc7`

**Created**: 2026-08-15

**Status**: **Implemented 2026-08-15** — `npx tsc --noEmit` clean, `npm run build` passes, and `scripts/verify-switch-account.mts` proves the authorisation against a throwaway Postgres 16 (**27/27**), including a forged ticket, a correctly-signed expired ticket, a ticket naming an unlinked or departed account, and — the critical case — a link revoked *after* the ticket was minted. No migration required.

**Input**: User description: "Password-less switching between linked accounts. Today the sidebar 'Switch account' (spec 025) signs the person out and lands them on /signin?email=... so they must re-enter the target account's password on every switch. A person holding two contracts across two group companies (two employee records sharing one HR-managed Employee ID) should hop between their own accounts without re-entering a password, as long as they already hold a valid session. Session lifetime is unchanged (NextAuth default 30 days). The switch must re-verify the link server-side at switch time (both records ACTIVE, same non-empty employeeId, target is not the current user) rather than trusting anything from the client, so the endpoint can never be used as a password bypass. Impersonation must be cleared across the switch and must never combine with it. Product decision: no extra password step for elevated-role targets (HR_ADMIN / SUPER_USER / FINANCE) — the simpler flow was chosen deliberately; record the residual risk that a mistyped shared Employee ID would link two different people and grant password-less access between them."

## Overview

Spec 025 gave a dual-contract person an **Employee ID** shared across their two employee records and a sidebar **"Switch account"** control. That control currently **signs the person out** and sends them to the sign-in page with the target email pre-filled, so **every switch costs a password entry**. In daily use — moving between two companies several times a day — that is friction on a journey the person takes constantly.

This feature makes the switch **immediate**: one click moves a signed-in person into their other linked account with **no password prompt**. Nothing else about signing in changes — the first sign-in of the day still needs a password, and **session lifetime is unchanged** (a normal session persists for 30 days, as today).

The security property that replaces the password is **the session the person already holds**. A switch is only ever permitted between accounts the platform can prove, at the moment of the switch, are the same person: both records active, both carrying the **same non-empty Employee ID**, and the request coming from a person who is already signed in to one of them. Nothing supplied by the browser is trusted to establish that link.

Each linked account remains **fully independent** — its own role, business-unit brand, employment type, salary, benefits, time-off and documents. Switching is navigation between one person's own accounts; it never merges data and never carries permissions across.

## Clarifications

### Session 2026-08-15

- Q: Should the switch keep asking for a password? → A: **No — password-less.** This **reverses the spec 025 decision** ("Ask once per switch — each switch re-authenticates with the target account's own password. No password-less hopping"). Spec 025's clarification is superseded by this spec; the rest of spec 025 (two emails, non-unique Employee ID, HR link confirmation) stands unchanged.
- Q: Should an elevated-role target (HR Admin / Super User / Finance) still require a password? → A: **No.** A role-gated password step was offered and **deliberately declined** in favour of the simpler, smoother flow, on the basis that linked accounts belong to one known person. The residual risk is recorded under *Residual Risks* below and accepted.
- Q: Should session lifetime change (shorter expiry, idle timeout)? → A: **No — keep the current 30-day session.** Reviewed and explicitly retained; out of scope for this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move between my own two accounts without a password (Priority: P1)

A person employed by two group companies is signed in to one account. They open the sidebar, pick their other account under **Switch account**, and land in it immediately — already signed in, seeing that company's brand, benefits and data. Switching back is the same single action.

**Why this priority**: This is the entire point of the feature and the only thing the person experiences directly.

**Independent Test**: Sign in as one of two linked accounts, click the other in the switcher, and confirm arrival in the target account with no password prompt, with the target's name, brand and navigation. Switch back and confirm the same.

**Acceptance Scenarios**:

1. **Given** a person signed in to account A, where account B is active and shares A's non-empty Employee ID, **When** they choose account B in the switcher, **Then** they are signed in as B without entering a password, and the app shows B's brand, role and data.
2. **Given** the person is now in account B, **When** they choose account A in the switcher, **Then** they are returned to A without entering a password.
3. **Given** a person whose account shares its Employee ID with no other active account, **When** they open the sidebar, **Then** no switcher is shown and no switch is possible.
4. **Given** account A is an Employee and account B carries an elevated role, **When** they switch from A to B, **Then** they hold **only B's** permissions in B, and on switching back hold only A's — no permission from either account persists into the other.

---

### User Story 2 - The switch can never be used to reach an account that isn't mine (Priority: P1)

Someone attempts to reach another person's account by driving the switch directly — replaying it, altering the target it names, or invoking it with no session at all. Every such attempt is refused, and the refusal is decided from stored records at the moment of the switch, not from anything the browser supplied.

**Why this priority**: Removing the password removes the thing that previously stopped this. The check that replaces it must be at least as strong, or the feature is a way in rather than a convenience. Equal priority to Story 1 — neither ships without the other.

**Independent Test**: Attempt a switch naming an account that does not share the actor's Employee ID; attempt one with no active session; attempt one naming an account whose Employee ID was since changed or cleared. Confirm every attempt is refused and no session is issued.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** a switch is attempted naming an account that does **not** share their non-empty Employee ID, **Then** it is refused and they stay in their current account.
2. **Given** no valid session, **When** a switch is attempted, **Then** it is refused and the person is sent to sign in as normal.
3. **Given** two accounts that both have a **blank or missing** Employee ID, **When** a switch between them is attempted, **Then** it is refused — an absent Employee ID never links anyone.
4. **Given** a link that existed when the page was rendered, **When** HR changes or clears one account's Employee ID before the switch is used, **Then** the switch is refused because the link is re-checked at the moment of the switch.
5. **Given** a target account whose employment has ended (status Left), **When** a switch to it is attempted, **Then** it is refused, exactly as sign-in to that account would be.
6. **Given** a switch naming the account the person is already in, **When** it is attempted, **Then** nothing changes and no error is shown to the person.

---

### User Story 3 - Switching and "View as employee" never combine (Priority: P2)

A Super User viewing the app as another employee (spec 024 impersonation) must not carry that borrowed view across a switch. Ending up in a second account *while still impersonating* would blur whose data is on screen and whose permissions are in force.

**Why this priority**: A real correctness and audit hazard, but it only affects Super Users using an admin tool, so it ranks below the everyday journey.

**Independent Test**: As a Super User with linked accounts, start "View as employee", then switch accounts. Confirm the impersonation is dropped and the target account is shown as itself.

**Acceptance Scenarios**:

1. **Given** a Super User currently viewing as another employee, **When** they switch accounts, **Then** the impersonation ends and they arrive in the target account as themselves.
2. **Given** a person who has just switched accounts, **When** the new session is inspected, **Then** it carries no impersonation from before the switch.

---

### Edge Cases

- **Target must set a password / has a temporary password**: the forced password-change gate still applies *after* arriving. Switching moves the person into the account; it never satisfies or skips that account's outstanding password requirement.
- **Session expires between rendering the sidebar and clicking**: treated as "no valid session" — the person is sent to sign in, not switched.
- **Three or more linked accounts**: all active accounts sharing the Employee ID are offered; the rules are per-pair and unchanged.
- **The person's own account is deactivated while they are signed in**: a switch *from* a now-inactive account is refused; the person signs in fresh.
- **Employee ID differing only by case or surrounding spaces**: treated consistently with how HR's linking warning matches, so the switcher and the link check never disagree about what counts as the same ID.
- **Two different people mistakenly given the same Employee ID**: they become linked and can switch into each other's accounts without a password. See *Residual Risks*.
- **Repeat/replayed switch request**: re-evaluated from stored records each time; a stale or repeated request grants nothing a fresh one would not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in person MUST be able to move to another of their linked accounts in a single action, without entering a password.
- **FR-002**: The system MUST permit a switch only when, **at the moment of the switch**: an active session exists; the acting account and target account are both active employees; both carry the **same Employee ID**; that Employee ID is **non-empty**; and the target is not the acting account itself.
- **FR-003**: The system MUST determine the link from stored employee records, and MUST NOT rely on any client-supplied claim about who is linked to whom.
- **FR-004**: A switch that fails any condition in FR-002 MUST leave the person's current session untouched and MUST NOT reveal whether the named account exists.
- **FR-005**: After a switch, the session MUST carry the **target account's** identity and role only; no permission, role or identity from the previous account may persist.
- **FR-006**: The system MUST clear any active impersonation as part of a switch, and MUST NOT allow impersonation and switching to be combined.
- **FR-007**: The switcher MUST continue to list only **active** accounts sharing the signed-in person's non-empty Employee ID, and MUST be hidden entirely when there are none.
- **FR-008**: Session lifetime and expiry behaviour MUST remain exactly as today — this feature changes how a switch is authorised, not how long a session lasts.
- **FR-009**: Any account-level requirement outstanding on the target — notably a forced password change — MUST still be enforced after arrival.
- **FR-010**: The switcher MUST remain unavailable while impersonating, as today.
- **FR-011**: Switching MUST NOT merge, copy or share data between linked accounts; each account's data, brand and settings remain independent.

### Key Entities

- **Employee record**: one person's employment at one group company — its own email (the login), role, status, business unit and data. Two records may represent the same human.
- **Employee ID**: the HR-managed person identifier. Optional and intentionally **not unique** — a shared, non-empty value is what marks two records as the same person, and is the sole basis on which a switch is permitted.
- **Session**: proof that a person authenticated as one specific account. Under this feature, holding a valid session for one account is what authorises moving to a linked one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person moves between two of their linked accounts in **one action with zero password entries**, arriving in under 5 seconds.
- **SC-002**: **100%** of switch attempts naming an account that does not share the actor's non-empty Employee ID are refused, including attempts that alter or replay the request.
- **SC-003**: **Zero** switches succeed without a pre-existing valid session.
- **SC-004**: After any switch, **100%** of pages show the target account's data, role and brand, with **zero** instances of the previous account's permissions remaining in force.
- **SC-005**: **Zero** switches leave an impersonation active.
- **SC-006**: Password entries per person per day fall from *once per switch* to **once per sign-in**, with no change to how often people must sign in.

## Assumptions

- The Employee ID link is authored by HR and already carries a deliberate confirmation step when it links two records (spec 025); this feature relies on that as the point where linking is intended.
- Linked accounts belong to **one real person**, which is what makes an existing session acceptable evidence for reaching the other account.
- The current 30-day session lifetime is appropriate and stays unchanged; shortening it or adding an idle timeout was considered and declined.
- The existing sidebar switcher's placement, labelling and appearance are unchanged — only what happens on click changes. Any visual change would need its own approval.
- Switching remains available only to the person themselves; it is not an admin tool for entering someone else's account (that is impersonation, which stays separate).
- No new employee data is collected, and no schema change is expected — the feature re-uses the Employee ID that spec 025 already stores.
- Audit logging of switches is **out of scope** for this spec.

## Residual Risks *(accepted)*

- **A mistyped Employee ID links two different people.** The Employee ID is typed by hand and is deliberately non-unique, so a typo can make two unrelated employees appear to be one person. Under this feature that link grants **password-less access in both directions** — each could enter the other's account and see their benefits, documents and dependants' details. Previously the target account's password stood in the way; it no longer does. HR's linking confirmation (spec 025) is the only remaining control, and a wrong Employee ID is corrected by HR editing the record, which breaks the link immediately.
- **An unlocked, signed-in device reaches every linked account.** With no password at the switch, anyone with access to an unlocked session holds all of that person's linked accounts, not just the one on screen.
- **An elevated-role linked account is reachable without a password.** If one of a person's linked accounts carries HR Admin, Super User or Finance permissions, it can be entered from their ordinary account with no password step. A role-gated password prompt was offered and declined in favour of the simpler flow; it remains the obvious mitigation if the linked-account population ever grows beyond known individual cases.

## Out of Scope

- Changing session lifetime, adding idle timeout, or any other change to how long people stay signed in.
- Simultaneous multi-account sessions (being signed in to both accounts at once, in different tabs).
- Merging linked accounts, or the full "one identity, many employments" model — that remains **spec 022**.
- Any change to the sidebar switcher's appearance, or to HR's Employee ID entry and linking warning.
- Audit logging or notification of account switches.
