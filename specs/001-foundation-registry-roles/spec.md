# Feature Specification: Foundation — Employee Registry & Roles

**Feature Branch**: `001-foundation-registry-roles`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Foundation — Employee Registry & Roles. The backbone module every other module reads from: domain-locked Google SSO, three roles (Employee / HR Admin / Super User) plus a manager capability from the org chart, and the employee registry (public + HR-private fields, HR-authoritative money fields, derived age/tenure)."

## Clarifications

### Session 2026-07-27

- **Q: What is the set of tenure bands?** → Four HR-set bands — 6mo–2y, 2–4y, 4–7y, 7–10y — carrying the Benefits pool ceiling (EGP). Full-time: 20,000 / 30,000 / 45,000 / 65,000. Part-time: 14,000 / 21,000 / 30,000 / 42,000. (Ceiling amounts belong to the Benefits module config; the band enum lives here.)
- **Q: Can employees edit their own profile?** → Only their contact field(s) (phone). All other registry fields are HR-managed and read-only to the employee.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with a company Google account (Priority: P1)

An employee opens the app and signs in with their Forefront Google account. Only accounts on the company domain are admitted; anyone else is refused. On first successful sign-in the person is matched to their existing employee record.

**Why this priority**: Authentication is the gate to the entire product — nothing else is reachable without it, and the domain lock is the core security boundary.

**Independent Test**: Attempt sign-in with a company-domain account (succeeds, lands on the app) and with a non-company account (refused with a clear message). Fully testable on its own.

**Acceptance Scenarios**:

1. **Given** a person with a `@forefront.consulting` Google account that matches an employee record, **When** they sign in, **Then** they are admitted and see the app as their role allows.
2. **Given** a person with a non-company Google account, **When** they attempt to sign in, **Then** they are refused and no session is created.
3. **Given** a company-domain account with **no** matching employee record, **When** they sign in, **Then** access is handled per the "unknown account" rule (see Assumptions) rather than silently creating a privileged account.

---

### User Story 2 - HR maintains the employee registry (Priority: P1)

An HR Admin creates and edits employee records — identity, department, title, phone, employment type, tenure band, reporting line, start/end date, status, date of birth, marital status, and dependants — so the registry is the single source of truth every other module reads.

**Why this priority**: The registry is the backbone; Directory, Onboarding, Benefits, Time-Off, and Dashboard all read from it. Without it, no other module has data.

**Independent Test**: As HR, create a new employee, set all fields, save, and re-open the record to confirm persistence; edit a field and confirm the change is reflected.

**Acceptance Scenarios**:

1. **Given** an HR Admin, **When** they create an employee with the required fields, **Then** the record is saved and appears in the registry.
2. **Given** an existing employee, **When** HR edits employment type, tenure band, or reporting line, **Then** the change is saved and used by downstream views.
3. **Given** an employee who leaves, **When** HR sets status to "Left" and records an end date, **Then** the record reflects the departure and is excluded from active-employee views.
4. **Given** a required field is missing, **When** HR tries to save, **Then** the save is rejected with a clear validation message.

---

### User Story 3 - Employee views their own profile (Priority: P1)

An employee opens "My Profile" and sees their own record, including derived values (age, years of service, dependants' ages). Money-affecting fields (employment type, tenure band) are shown read-only.

**Why this priority**: Every employee needs visibility into their own record, and this proves the read path and the public/private field model.

**Independent Test**: Sign in as an employee, open My Profile, confirm own data displays and that employment type / tenure band are not editable.

**Acceptance Scenarios**:

1. **Given** a signed-in employee, **When** they open My Profile, **Then** they see their own identity, contact, employment, and dependant information.
2. **Given** the profile view, **When** it renders age / years of service / dependants' ages, **Then** these are computed from stored dates and not separately editable.
3. **Given** an employee, **When** they view My Profile, **Then** employment type and tenure band are read-only.

---

### User Story 4 - Role-based access & governance (Priority: P2)

Roles gate what each person can do. A Super User can grant or revoke roles and change app-wide settings; HR Admins manage HR content and the registry; Employees have self-service only. Bootstrap admins come from a configured allowlist. All gating is enforced on the server.

**Why this priority**: Correct authorization protects PII and money rules, but it builds on top of authentication and the registry.

**Independent Test**: Confirm an Employee cannot reach admin surfaces (server refuses, not just hidden UI); confirm a Super User can promote another employee to HR Admin.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they request an admin-only surface or action, **Then** the server refuses regardless of UI state.
2. **Given** a Super User, **When** they grant HR Admin to an employee, **Then** that employee gains HR Admin access on their next authorized action.
3. **Given** an email on the bootstrap allowlist, **When** that person signs in for the first time, **Then** they receive admin access without a manual database edit.
4. **Given** an HR Admin, **When** they attempt to grant or revoke roles, **Then** the action is refused (role governance is Super User only).

---

### User Story 5 - Field visibility split (public vs HR-private) (Priority: P2)

Employees can see each other's public fields (name, email, department, title, phone) but not each other's HR-private fields (employment type, dates, status, date of birth, marital status, dependants, reporting-line details beyond the org chart). HR Admin / Super User can see everything.

**Why this priority**: Protects sensitive PII while still enabling the directory; a wrong split leaks personal data.

**Independent Test**: As an Employee, view another employee and confirm only public fields are returned by the server; as HR, confirm private fields are visible.

**Acceptance Scenarios**:

1. **Given** an Employee viewing another employee, **When** the record is served, **Then** only public fields are included.
2. **Given** an HR Admin viewing any employee, **When** the record is served, **Then** private fields are included.
3. **Given** any consumer, **When** private fields are requested without authorization, **Then** the server does not return them (enforced server-side, not by hiding in the UI).

---

### User Story 6 - My Documents (personal document upload) (Priority: P2)

An employee, from their Profile, uploads and views their own personal documents (ID, certificates, signed contract, HR letters). Only they and HR / Super User can see their file. HR / Super User can view any employee's documents and can also upload to a person's file.

**Why this priority**: Onboarding's "upload required documents" step lands here, and it keeps each person's paperwork in one private place — but it builds on the profile/registry.

**Independent Test**: As an employee, upload a document to My Documents and confirm it appears for you and for HR, but not for another employee.

**Acceptance Scenarios**:

1. **Given** an employee on their Profile, **When** they upload a document, **Then** it is saved to their personal file and listed for them.
2. **Given** an employee's personal document, **When** another (non-HR) employee tries to access it, **Then** the system does not return it.
3. **Given** HR / Super User, **When** they open an employee's record, **Then** they can view (and upload to) that employee's personal documents.
4. **Given** a document the employee uploaded, **When** they choose to delete or replace it, **Then** the change is applied (employees manage their own uploads; HR can remove any).

### Edge Cases

- **Unknown company-domain account** (no employee record): handled per the "unknown account" rule (see Assumptions) — never auto-provisioned as an admin.
- **Large or unsupported document upload**: rejected with a clear message rather than failing silently (specific limits set at planning).
- **Placeholder / non-company email** on a record: the person appears in the directory but cannot sign in until they have a company-domain address; the record is not blocked from existing.
- **Employee with no reporting line** (e.g., the Managing Director): allowed; they simply have no manager and may sit at the top of the org chart.
- **Reporting line integrity**: a reporting line cannot point to a non-existent employee, to the employee themselves, or form a cycle.
- **Left employees**: excluded from active-employee and directory views but retained for HR/history; their reports must be reassigned or flagged.
- **Missing optional PII** (DOB, marital status, dependants): allowed to be blank; derived values that depend on missing data are shown as unavailable rather than guessed.
- **Dependant with a future/expected birth date**: recorded only once confirmed; expected dates are not treated as born.
- **Role self-demotion**: a Super User attempting to remove the last Super User is prevented (there must always be at least one).

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & session**
- **FR-001**: The system MUST allow sign-in only via Google accounts on the configured company domain, enforced on the server sign-in path, not merely hidden in the UI.
- **FR-002**: The system MUST refuse any non-company-domain account and create no session for it.
- **FR-003**: On successful sign-in, the system MUST match the account to an existing employee record by email.

**Roles & authorization**
- **FR-004**: The system MUST support three roles — Employee, HR Admin, and Super User — where Super User includes all HR Admin capabilities plus role governance and app-wide settings.
- **FR-005**: The system MUST enforce every admin capability on the server (surfaces and actions), independent of what the UI shows.
- **FR-006**: The system MUST grant bootstrap admin access to accounts listed on a configured allowlist without any manual database edit.
- **FR-007**: The system MUST allow a Super User (and only a Super User) to grant or revoke roles for other employees.
- **FR-008**: The system MUST prevent removal of the last remaining Super User.
- **FR-009**: The system MUST derive a "manager" capability from the org chart (an employee who has at least one direct report) without it being a separately assignable role.

**Employee registry — data & maintenance**
- **FR-010**: The system MUST store, per employee: full name, email, department, job title, phone, employment type (Full-time / Part-time), tenure band, start date, end date, status (Active / Left), date of birth, marital status, dependants (each with name and date of birth), and reporting line.
- **FR-011**: The system MUST allow HR Admin / Super User to create and edit employee records.
- **FR-012**: The system MUST treat money-affecting fields (employment type, tenure band) as HR-set and authoritative; employees MUST NOT be able to change them.
- **FR-013**: The system MUST validate required fields on save and reject incomplete records with a clear message.
- **FR-014**: The system MUST prevent an invalid reporting line (self-reference, non-existent target, or cycle).
- **FR-015**: The system MUST compute age, years of service, and dependants' ages from stored dates and never store them as editable values.
- **FR-016**: The system MUST support marking an employee as "Left" with an end date and exclude such employees from active-employee and directory views while retaining the record for HR.

**Visibility**
- **FR-017**: The system MUST expose only public fields (name, email, department, title, phone) of one employee to another employee.
- **FR-018**: The system MUST restrict HR-private fields (employment type, tenure band, start/end date, **monthly salary**, status, date of birth, marital status, dependants, detailed reporting data) to HR Admin / Super User, enforced server-side.
- **FR-019**: The system MUST allow an employee to view their own full record (including their own private fields) in read-only form for money-affecting fields.
- **FR-020**: The system MUST provide HR Admin / Super User an editable registry grid on the admin Employees list — inline cells typed to each field (text/email, date pickers, dropdowns for enums and the reporting line) with per-field save. Each inline update MUST enforce the same server-side governance as the full form: Super-User-only role changes, email uniqueness, reporting-line self/cycle guards (FR-014), and required-field validation (FR-013); an actor MUST NOT change their own role or status inline. Column visibility/order **and the filter selections** are per-user client preferences that MUST persist across visits (browser-local) and MUST NOT affect what data the server exposes (FR-018).

**Personal documents (My Documents)**
- **FR-024**: The system MUST let an employee upload and view their own personal documents from their Profile.
- **FR-025**: The system MUST restrict a personal document to its owner and HR / Super User, enforced server-side; no other employee can access it.
- **FR-026**: HR / Super User MUST be able to view and upload personal documents on any employee's record.
- **FR-027**: The system MUST let an employee delete or replace their own uploaded documents; HR / Super User may remove any.

**Data handling**
- **FR-020**: The system MUST support loading the initial team dataset via a database seed that is kept out of version control because it contains personal data (dates of birth, marital status, children's birth dates).
- **FR-021**: The system MUST allow an employee record to exist with a placeholder (non-company) email such that the person appears in the directory but cannot sign in until a company-domain email is set.

- **FR-022**: The system MUST record tenure using one of four HR-set tenure bands — **6 months–2 years, 2–4 years, 4–7 years, 7–10 years** — which drive the Benefits pool ceiling (confirmed 2026-07-27).
- **FR-023**: Employees MUST be able to edit only their own **contact field(s)** (phone); all other registry fields are HR-managed and read-only to the employee (confirmed 2026-07-27).

### Key Entities *(include if feature involves data)*

- **Employee (the registry / User record)**: the backbone person record. Public attributes (name, email, department, title, phone) and HR-private attributes (employment type, tenure band, start/end date, status, date of birth, marital status). Has one reporting line to another Employee (optional) and zero or more Dependants. Holds a role (Employee / HR Admin / Super User). Email doubles as the login identity.
- **Dependant**: a child or dependant of an Employee, with a name and a date of birth; drives benefits eligibility later (family cover, special-event gifts). Age is derived, not stored.
- **Role**: the authorization level of an Employee — Employee, HR Admin, or Super User (superset). The manager capability is not stored here; it is derived from reporting lines.
- **Department**: an organizational grouping in use (Consulting, Financial, Top Management, Marketing & Community, Data Management Unit).
- **Personal Document**: a file belonging to one Employee (ID, certificate, contract, HR letter), visible only to that employee and HR / Super User. Uploaded by the employee or by HR. Company-wide/shared documents are NOT here — those live in the Handbook & Resources module.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sign-in attempts from non-company-domain accounts are refused with no session created.
- **SC-002**: 100% of admin-only actions are refused for Employee-role accounts when attempted directly (not just hidden in the UI).
- **SC-003**: An HR Admin can create a complete employee record in under 3 minutes, and the record is immediately visible to every module that reads the registry.
- **SC-004**: An employee can find and open their own profile within 10 seconds of signing in and see correct derived age and years of service.
- **SC-005**: A Super User can promote another employee to HR Admin, and the change takes effect on that employee's next authorized action without any manual database edit.
- **SC-006**: Zero HR-private fields of one employee are ever returned to another (non-HR) employee across all registry and directory views.
- **SC-007**: The full active team (19 records at launch) loads from the seed and displays correctly in the directory.

## Assumptions

- **Unknown account rule**: a company-domain account with no matching employee record is not auto-provisioned with any admin access; it is either denied until HR creates a record or given a minimal "unrecognized" state (final behavior to be confirmed during planning). It never becomes HR Admin or Super User automatically.
- **Left employees** are hidden from the employee-facing directory and active views but retained in HR views for history; their direct reports are reassigned or flagged by HR.
- **Tenure band** is an HR-set value now; automatic derivation from start date is a later enhancement and out of scope here.
- **Phone** is a public directory field (confirmed).
- **Dependants' names** may be blank for existing records until provided; the data model supports them.
- **No email notifications** are part of this feature (or v1 at all).
- **Reuse**: this feature provides the `User`/registry and role model that all later modules (Directory, Onboarding, Benefits, Time-Off, Dashboard, Handbook) depend on.
