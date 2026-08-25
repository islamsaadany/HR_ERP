# Phase 1 Contracts — Performance Reviews & 1:1s

The module exposes **server actions** (the house pattern — see `src/app/(app)/time-off/actions.ts`)
plus one serving route for the uploaded Gallup PDF. There is no public API surface.

## The gate every entry point passes through

```
requireRealUser()          // src/lib/reviews/access.ts
```

- Resolves the **auth session user only**. It never consults the impersonation cookie, so a Super User
  "viewing as" an employee cannot reach this module (research R1).
- Refuses outright while impersonating: actions return an error, pages render an explanation and no
  data.
- **Every** action and route below begins here. `requireUser()` from `src/lib/roles.ts` MUST NOT be
  used anywhere in this feature.

Then one of the derivations in `src/lib/reviews/access.ts`, which is the **only** place these
questions are answered:

| Helper | Answers |
|---|---|
| `sheetForRead(sheetId, meId)` | The sheet if I am one of its **stored** pair, else null |
| `isOpen(sheet)` | `openedAt != null` — visible and frozen are the same state |
| `myHalf(sheet, meId)` | `"employee"` \| `"manager"` |
| `canEditHalf(sheet, meId)` | Not open, and the item's author is me |
| `oneOnOneForRead(id, meId)` | The 1:1 if I am one of its stored pair, else null |
| `visibleItemsWhere(sheet, meId)` | `{ authorId: meId }` until open, unscoped after |

`visibleItemsWhere` is what keeps a sealed half off the wire: the **query** is scoped, so the payload
never contains the other person's items to be hidden client-side (FR-008, research R3).

---

## Server actions

### Review sheet

| Action | Input | Rules |
|---|---|---|
| `openSheetForQuarter` | `year`, `quarter`, `counterpartId` | Creates the sheet if absent; the pair is taken from the **current** org chart and then stored. Refuses if the two are not manager↔report today. |
| `saveItem` | `sheetId`, `questionKey`, `body`, `position` | Refuses once `openedAt` is set. Author is always the caller — never taken from input. |
| `deleteItem` | `itemId` | Same guard; only the author's own item. |
| `promoteJournalEntry` | `sheetId`, `entryId`, `questionKey` | Entry must be the caller's own. Copies `body`; sets `sourceKind=JOURNAL`, `sourceId`. Idempotent via the partial unique index. |
| `promoteOneOnOneOutcome` | `sheetId`, `oneOnOneId`, `questionKey` | 1:1 must be final and belong to the caller's pair. Copies the outcome text. |
| `setStrengthsPicks` | `sheetId`, `questionKey`, `themeCodes[]` | Codes must exist in the caller's **own** profile. Stores the theme **name** as `body`. |
| `submitHalf` | `sheetId` | Stamps my `…SubmittedAt`. **Opens nothing.** |
| `confirmMeetingHeld` | `sheetId` | Stamps my `…MetConfirmedAt`; if all four timestamps are now present, stamps `openedAt` in the **same transaction**. |
| `writeOutcome` | `sheetId`, five text fields | Refused unless `openedAt` is set. Editing clears both acknowledgements. |
| `acknowledgeOutcome` | `sheetId` | Stamps my ack; stamps `finalAt` when both present. |

`confirmMeetingHeld` is the only place `openedAt` is ever written, and it is written under the same
per-row lock pattern used for the benefits pool (`SELECT … FOR UPDATE` on the sheet row) so two
simultaneous confirmations cannot both read "not yet complete" and leave the sheet sealed.

### Journal

| Action | Input | Rules |
|---|---|---|
| `addJournalEntry` | `occurredOn`, `section?`, `body` | Author is the caller, always. |
| `editJournalEntry` / `deleteJournalEntry` | `entryId`, … | `where: { id, authorId: me.id }` — never `findUnique` then compare. |

Every journal read is `where: { authorId: me.id }`. There is no action, route, page, or export that
accepts another user's id for a journal (FR-016).

### 1:1s

| Action | Input | Rules |
|---|---|---|
| `createOneOnOne` | `counterpartId`, `heldOn` | Refuses unless manager↔report today; stores the pair. |
| `addOneOnOneNote` | `oneOnOneId`, `body` | Caller must be one of the stored pair; refused after `finalAt`. |
| `writeOneOnOneOutcome` | `oneOnOneId`, `outcome` | Refused after `finalAt`; editing clears both acks. |
| `acknowledgeOneOnOne` | `oneOnOneId` | Stamps my ack; stamps `finalAt` when both present. |

### Strengths (HR/Super User)

| Action | Input | Rules |
|---|---|---|
| `parseStrengthsUpload` | `employeeId`, file | `requireAdmin()`. Uploads to the **private** blob store, extracts themes, returns a **proposal**. Writes nothing to the profile. |
| `confirmStrengthsProfile` | `employeeId`, `themeCodes[]` ordered, `assessmentDate?`, `blobUrl?` | `requireAdmin()`. Replaces the profile's theme rows. The only path that persists a profile. |
| `clearStrengthsProfile` | `employeeId` | `requireAdmin()`. Removes the profile; past sheet items are untouched. |

`parseStrengthsUpload` returns `{ themes[], printedName, assessmentDate, warnings[] }` — and on a
failed parse returns the failure with an empty theme list so the operator lands in manual entry
(FR-027). It never guesses a theme it could not resolve; an unresolved rank is reported as a gap.

---

## Serving route

### `GET /api/reviews/strengths/[profileId]`

Streams the stored Gallup PDF via `streamPrivateBlob`.

- Allowed: the **profile's own employee**, and HR Admin / Super User (research R7).
- Everyone else: **404, not 403** — a 403 confirms the file exists (the `EMPLOYEE_VISIBLE_SLOTS`
  lesson from Learning).
- The permission question is re-asked here on every request. The route never trusts that a link was
  only rendered for someone entitled to it.

There is **no** route that serves a review sheet, outcome, 1:1, or journal entry as data.

---

## Errors and refusals

| Situation | Response |
|---|---|
| Not one of the pair | Treated as not found — never "forbidden" |
| Impersonating | Refused with an explanation naming impersonation |
| Writing to an open (frozen) sheet | Refused, stating the sheet is closed after the meeting |
| Confirming a meeting before both submitted | Refused, stating both halves must be submitted first |
| 1:1 with a non-pair | Refused, stating 1:1s are between a manager and their report |
| Strengths pick not in the caller's own profile | Refused — the picker is per person by construction |
