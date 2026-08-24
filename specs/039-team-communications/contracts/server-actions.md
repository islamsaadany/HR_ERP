# Contracts: Team Communications (spec 039)

**Date**: 2026-08-24

The callable surface. Two rules hold this whole file together, both structural rather than
remembered:

1. **Every export from a `"use server"` file is a public POST endpoint.** Spec 038 shipped four
   unused exports that were live endpoints nothing called, and one query with no guard at all.
   Nothing is exported here that is not called, and every export begins with a guard.
2. **No action takes an actor id as a parameter.** Who is acting is only ever what the resolver
   returns. A new action cannot skip the check, because there is no other way to find out who is
   sending.

---

## Who may do what

| | Compose / send announcement | Edit + send a congratulation | See the whole queue | Change settings |
|---|---|---|---|---|
| **HR Admin / Super User** | yes | yes (any) | yes | yes |
| **A line manager** | no | **only their own assigned drafts** | no | no |
| **Anyone else** | no | no | no | no |

`requireCommsSender()` — HR Admin or Super User.
`requireAssignee(messageId)` — HR, **or** the person the draft is assigned to. Returns the actor.

---

## Announcements — `src/app/(app)/admin/communications/actions.ts`

### `createAnnouncement(formData): Promise<Result<{ id }>>`
`requireCommsSender()`. Subject required (≤200 chars), body required. Creates `state = DRAFT`.

### `updateAnnouncement(id, formData): Promise<Result>`
`requireCommsSender()`. **Refused unless `state = DRAFT`** — a sent message is a record.

### `setAnnouncementAudience(id, field, values[]): Promise<Result>` / `removeAudienceChoice(id, rowId)`
`requireCommsSender()`. Several values per call, mirroring `addAccessChoices`. Every fault is
reported **together**, not one refusal at a time — and deliberately not all-or-nothing: one stale
name must not throw away the other seven choices.

### `sendAnnouncement(id, confirmedCount): Promise<Result<{ sent, failed }>>`
`requireCommsSender()`. The one irreversible action in the feature, so it is guarded four ways:

1. **`state = DRAFT`** re-read *inside* the transaction. Two people pressing send, and the second
   is told it has already gone (FR-032).
2. **`confirmedCount` must equal the count the server computes now.** If somebody joined the
   department between the confirmation dialog and the click, the send is refused and the operator
   re-confirms against the real number. A confirmation that can silently cover more people than it
   named is not a confirmation.
3. **Empty audience is refused** with the reason (FR-015) — never a cheerful "sent to 0 people".
4. **Email off or unconfigured** → refused with a plain reason. Never silently swallowed.

Expands the audience → writes one `MessageRecipient` per person (PENDING) → sends in **chunks of
100** → stamps each row ACCEPTED or FAILED with the provider's id or its error → sets
`state = SENT`, `sentById`, `sentAt`, `recipientCount`.

Returns how many were accepted and how many failed. **A partial failure is still a send** — the
message does not roll back, because the people who received it did receive it.

---

## Congratulations — same file

### `updateCongratulation(id, formData): Promise<Result>`
`requireAssignee(id)`. DRAFT only. The manager may rewrite every word — that is the point, and it
is what makes signing it with their name honest.

### `sendCongratulation(id): Promise<Result>`
`requireAssignee(id)`. Guards, in order:

1. `state = DRAFT`, re-read in the transaction.
2. **The subject is still an active employee.** A leaver's draft is refused, not sent (FR-027).
3. **Not past the occasion date.** Refused with "this was for 21/08 — it is closed now" rather
   than sent late (FR-026).
4. Email configured and on.

One `MessageRecipient`. Signed with `sentById`.

### `dismissCongratulation(id, reason?): Promise<Result>`
`requireAssignee(id)`. Closes a draft the manager judges inappropriate — someone on
compassionate leave, a person who has asked not to be marked. Sets `MISSED` with the reason. A
manager needs a way to say "not this one" that is not silence.

---

## Settings — `src/app/(app)/admin/communications/settings-actions.ts`

### `setDisplayName(name)` / `setCongratsLeadDays(days)`
`requireCommsSender()`. Lead days 0–30.

**`setDisplayName` must warn**, in the UI, that it also re-brands the claim and holiday emails —
there is one display name for the whole platform (research D10). A setting that quietly changes
something else is how trust goes.

### `sendTestToSelf(): Promise<Result>`
`requireCommsSender()`. Sends **to the actor's own address only** — it takes no recipient
parameter, so it cannot be turned into a way to mail an arbitrary address. Renders through the
same builder as a real send (FR-035/FR-036).

---

## Reads — `src/lib/comms/*` (plain functions, NOT `"use server"`)

Exported from library files rather than an action file, deliberately: spec 038's `audienceReach`
was exported from a `"use server"` file with no guard, making audience sizes enumerable by anyone
who knew the request shape. Callers do their own authorisation.

- `pendingForAssignee(userId)` — a manager's drafts, and the sidebar count.
- `pendingQueue()` — every pending draft, for HR.
- `deliveryReadiness()` — the four-state readout (research D2): **ready** · **ready for you
  only** · **key refused** · **could not check**. Never reports a state it did not verify.
- `audienceReachByChoice(messageId)` — per choice, through the same derivation the send uses. A
  count computed separately to "look right" eventually disagrees with who actually gets the thing,
  and then it is worse than no count.

---

## Cron — `GET /api/cron/communications`

`Authorization: Bearer $CRON_SECRET`. **Refuses when `CRON_SECRET` is unset** — an open endpoint
that writes drafts and emails managers is not a safe default. Copied from the holidays route.

Per run:
1. Find birthdays and joining anniversaries falling within `congratsLeadDays`, for **active**
   employees with the relevant date on record.
2. Upsert an `Occasion` on `(userId, kind, occasionYear)` — the unique index makes a repeat run a
   no-op.
3. For each new occasion, create a DRAFT assigned to the line manager (HR when they have none, or
   when the manager is the subject).
4. Close any DRAFT whose occasion has passed → `MISSED`.
5. Send **at most one** nudge per assignee per run, listing what is waiting.

**It never emails an employee.** Only assignees, and only as operators. This is spec 037's line
and it is not crossed.

Work is chosen **by date, not by "did yesterday's run happen"** — a day the platform was
unreachable is caught by the next run rather than skipped forever.

---

## Rendering — `src/lib/comms/render.ts`

```ts
renderMessage(input: {
  kind; subject; body; cta?;
  unit: { name; primaryColor; accentColor } | null;   // null = no unit → group fallback
  groupName: string;
  signedBy?: string;
}): { html: string; text: string }
```

**The only place email HTML is built.** The preview route and every send path call this. A preview
drawn any other way is a picture of an email nobody will receive (research D8) — and it drifts on
the first change, invisibly, until somebody complains about a real message.

A `text` part is returned alongside the HTML because a message with no plain-text alternative
scores worse with spam filters and is unreadable in a text-only client.

---

## Result shape

```ts
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };
```

The house shape. Every error string is written for the operator reading it — "Karim Hassan has
left, so this can't be sent", not "FK constraint violation".
