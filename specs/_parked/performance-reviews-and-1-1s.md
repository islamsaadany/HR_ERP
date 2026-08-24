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

## 3. Proposed shape (for discussion — nothing agreed)

Three objects, not one form.

1. **Running journal** — open all quarter. Short dated entries, each tagged to a template section
   (went well / didn't / learning / blocker / expectation). This is what makes the review honest:
   nobody remembers March in June. 1:1 notes are journal entries marked "discussed on `<date>`",
   not a separate module.
2. **Review sheet** — one per pair per cycle, sections exactly as the template above. Assembled
   from the journal entries the author promotes, the carry-forward from last cycle, and the system
   pack. **Two authors:** section 1D and 2A are addressed to the other party, so the manager fills a
   mirrored half.
3. **Agreed outcome** — the only thing that outlives the meeting: top 3 priorities, risks to watch,
   what would make the next review a success, and each side's commitments. It becomes the
   carry-forward that opens the next cycle's sheet.

**System pack** — the facts the platform can state without anyone typing them (candidate: working
days taken this cycle, onboarding completion, learning progress, data-request responsiveness). It is
context for the conversation, never a score.

## 4. Recommended mechanisms (each still needs sign-off)

- **The journal is private to its author, permanently.** The moment a manager can read it, people
  stop writing honestly and it becomes theatre. Only promoted entries surface on the sheet.
- **Both halves stay sealed until both are submitted**, then both open. Otherwise whoever writes
  second anchors on the first, and "mutual expectations" stops being mutual.
- **The sheet freezes when the meeting is marked held.** The outcome is written after and
  acknowledged by both. Without a freeze, history quietly rewrites itself.
- **No money on this surface, ever.** Pool figures, claims, and salary have no place on a
  performance page — it turns a review into a compensation negotiation and leaks money facts to
  managers who have no business seeing them.

## 5. Open questions (blocking a spec)

1. **Cadence vs. wording.** The template asks "this **year**" throughout, but the request is
   quarterly. Quarterly cycles with an annual roll-up, and the wording changed to "this period"?
2. **Who else reads it.** Recommendation: HR sees *that* a review happened (cycle compliance), not
   its contents. Does a Super User get a break-glass, and is it logged?
3. **Who opens a cycle.** HR opens a review cycle platform-wide (like the benefits plan year), or
   each pair schedules their own?
4. **Coverage.** Every employee with a manager, or an opt-in set of pairs to start?
5. **Strengths vocabulary.** The template names CliftonStrengths-style strengths (Restorative,
   Arranger, Responsibility, Developer, Strategic, Achiever, Analytical). If that vocabulary is
   company-wide, "strengths I relied on / misutilized" should be a picklist on the employee record —
   comparable across cycles — rather than free text.
6. **Skipped reviews.** What happens when a cycle closes with a sheet half-filled or no meeting held?
