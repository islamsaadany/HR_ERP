# PARKED — Performance reviews & 1:1s

> **Status: parked. Not a spec.** Nothing here is agreed, specced, or built. This file exists so the
> request, the source template, and the thinking survive between sessions. It gets promoted to a real
> `specs/0NN-…` folder only after an explicit alignment round.
>
> Raised 2026-08-22 · template + approach added 2026-08-24.

---

## 1. What was asked for

Host the recurring performance reviews and manager↔report 1:1s on the platform, so that:

- the review document is **filled across the quarter**, not written the night before — the person
  captures issues and moments **as they happen**, to raise at the quarterly review;
- the quarterly review has **two inputs**: this self-authored document, **and** what the system
  already knows about the person's work;
- **both parties** write what they want out of the review **before** they meet;
- something can be **carried forward from the previous quarter** and stay with the person;
- the meeting produces a **combined outcome** both sides can return to before the next review.

## 2. Source template (verbatim, as supplied)

The example answers are the requester's own and are kept only to show how each prompt is meant to be
used. They are **not** seed data and must never ship as placeholder text.

```
PERFORMANCE REVIEW AGENDA

1. REFLECTIONS

A. What Went Well
 * What achievements are you most proud of this year?
     1. Leadership management style enhancement
     2. Running multiple projects at same time. (even though I should stop)
     3. Building the marketing team
     4. Building my understanding for the B2B market
 * Where do you think you created the most value?
     1. Getting things out live
 * What strengths did you rely on most?
     1. Restorative
     2. Arranger
     3. Responsibility
     4. To be coached (my behavior)

B. What Didn't Go Well
 * What didn't work as expected?
     1. My plans (I had much more plans and this somehow is pressuring me.)
     2. Time management
     3. Big Projects
 * Where did you struggle or feel blocked?
     1. Team management (putting them on the execution road)
     2. process/projects managements (event/retreats/brands' website)
 * What strengths did you misutilize?
     1. Developer, Strategic, Achiever, Analytical.

C. Key Learnings
 * Top 2–3 lessons you learned this year.
     * People matters more than work
     * I need to let go, when it's needed.
 * Skills, behaviors, or mindsets you developed.
     * We are not all alike
     * We should not all of us perform on the same level
     * Positivity! And balancing between it and being restorative
     * People's energy is charged in multiple different ways.
     * calmness
 * One lesson you want to intentionally carry forward.
     * Leading with nurturing.
   —----
     * Tactics per team using their strengths
     * Add to positivity, appreciation
     * Calm leadership

D. Mutual Expectations Review
 * What you expected from me and did happen.
 * What you expected from me and did not happen.
   Usually, I don't have any expectations. But I always felt valued, which was great.

2. FORWARD-LOOKING EXPECTATIONS

A. What You Expect from the Other Party
 * What support do you need more of?
     * Workload and expected outcomes. To be set and to be aligned on.
 * What should I do differently?
     * nah
 * What should I continue doing?
     * Leadership Reflections and guidance in execution (خصوصا لما بغرق)
   —--------------
     * Team reflection about myself and the team.
     * Progress reporting, per Quarter

B. Alignment & Commitments
 * Top 3 priorities for the next period.
     * Team responsibility strength to be activated
     * How to juggle between brands
 * Key risks or concerns to watch.
 * What would make the next review feel like a success?
```

## 3. Proposed shape

Four objects, not one form. **Corrected 2026-08-24:** the 1:1 was first proposed as a journal entry;
it is its own element, because a 1:1 produces an **outcome both parties align on** — a journal entry
has one author and no counterpart.

1. **Running journal** — open all quarter, one author, private. Short dated entries, each tagged to
   a template section (went well / didn't / learning / blocker / expectation). This is what makes the
   review honest: nobody remembers March in June. Solo capture *between* conversations.
2. **1:1 record** — an ad-hoc meeting between a pair, held whenever it is needed rather than waiting
   for the quarter. Notes plus an **outcome both sides acknowledge**. Structurally a small sibling of
   the review, not a note: same pair, same freeze-on-held rule, same carry-forward behaviour.
3. **Review sheet** — one per pair per cycle, sections exactly as the template above. Assembled from
   the journal entries the author promotes, the 1:1 outcomes from the cycle, the carry-forward from
   last cycle, and the system pack. **Two authors:** section 1D and 2A are addressed to the other
   party, so the manager fills a mirrored half.
4. **Agreed outcome** — the only thing that outlives the meeting: top 3 priorities, risks to watch,
   what would make the next review a success, and each side's commitments. It becomes the
   carry-forward that opens the next cycle's sheet.

The 1:1 is what stops the quarter being the only moment anything gets resolved; the review is where
a quarter of those outcomes is read together.

**System pack** — the facts the platform can state without anyone typing them (candidate: working
days taken this cycle, onboarding completion, learning progress, data-request responsiveness). It is
context for the conversation, never a score.

## 4. Mechanisms — **all four agreed 2026-08-24**

- **The journal is private to its author, permanently.** The moment a manager can read it, people
  stop writing honestly and it becomes theatre. Only promoted entries surface on the sheet.
- **Both halves stay sealed until both are submitted**, then both open. Otherwise whoever writes
  second anchors on the first, and "mutual expectations" stops being mutual. *Applies to the
  quarterly sheet only — sealing an ad-hoc 1:1 would add friction to the thing whose whole value is
  being quick. A 1:1 outcome needs both to acknowledge, not to write blind.*
- **The sheet freezes when the meeting is marked held.** The outcome is written after and
  acknowledged by both. Without a freeze, history quietly rewrites itself. Same rule for a 1:1
  record once its outcome is acknowledged.
- **No money on this surface, ever.** Pool figures, claims, and salary have no place on a
  performance page — it turns a review into a compensation negotiation and leaks money facts to
  managers who have no business seeing them.

## 5. Settled (2026-08-24)

- **Quarterly cycles.** The template's "this year" wording becomes "this period".
- **HR does not view reviews or 1:1s — contents or existence.** This module is not an HR surface.
  Consequences to honour when specced: no admin oversight screen, no completion/compliance
  reporting, no Super User break-glass; a cycle cannot be opened by HR (see open Q); and **access
  follows the pair, not the chair** — when someone changes manager, the new manager does **not**
  inherit read access to sheets written with the previous one.
- **1:1s are their own element**, not journal entries — see §3.

## 6. Open questions (blocking a spec)

1. **1:1 scope** — manager↔report only, or any two employees (peer 1:1s)?
2. **1:1 → review flow** — do a cycle's 1:1 outcomes appear on the quarter sheet automatically, or
   does each person promote the ones they want to raise?
3. **Who opens a cycle** — with HR out, the plausible answer is the calendar: Q1–Q4 open and close
   automatically, no operator. Confirm, or does each pair run its own schedule?
4. **Strengths vocabulary** — the template names CliftonStrengths-style strengths (Restorative,
   Arranger, Responsibility, Developer, Strategic, Achiever, Analytical). If that vocabulary is
   company-wide, "strengths I relied on / misutilized" should be a picklist on the employee record —
   comparable across cycles — rather than free text.
5. **Coverage** — every employee with a manager, or a few pairs first? *Recommendation: everyone
   with a manager; with HR unable to see anything, a pilot has no way to be observed anyway.*
6. **Skipped cycles** — a quarter that closes with a half-filled sheet and no meeting. *Recommendation:
   it closes as-is and stays readable; nothing chases anybody, since chasing implies an overseer and
   there isn't one.*
