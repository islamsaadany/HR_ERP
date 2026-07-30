# Spec 008 — Knowledge Base (Consulting References & Reads)

**Status:** implemented (V1)
**Input**: "Split the Handbook: company/structure/governance/documentation stay in the Handbook;
the consulting craft (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) becomes a
**Knowledge Base** of short 'reads' authored by admins. Articles are written in Markdown produced
by a shared Claude prompt (front-matter + body), rendering with real visuals (tables, callouts,
mermaid diagrams). Employees browse/read; HR authors."

## Why
The Handbook mixed two things: how *the company* runs (stable operating reference) and the
*consulting craft* (knowledge that grows over time). The craft belongs in a dedicated, admin-grown
library of bite-sized reads.

## Clarifications
- **Naming:** the module is **Knowledge Base** (nav label "Knowledge Base").
- **Model:** a dedicated `KnowledgeArticle` (not a flag on handbook sections).
- **Granularity:** small standalone **articles ("bites")** grouped by a free-text **category**
  (e.g. Strategy Consulting, AI-Strategy Consulting, Assignment Phases, Change Management & Influence).
- **Authoring:** admins generate an article with a shared **Claude prompt** (shown + copyable in the
  admin), paste the result, the app parses front-matter into fields, and it renders on save. Faster
  and more consistent than a rich-text editor.
- **Visuals:** the Markdown body renders GFM **tables**, `[!KEY]/[!TIP]/[!NOTE]/[!WARNING]`
  **callout boxes**, and **mermaid** diagrams. Photographs/branded graphics are out of scope for V1.
- **Deck attachment:** a topic MAY attach a single **slide deck (PDF)**. The employee reader shows the
  written blurb first, then the deck embedded inline (with a download link) — so slide-heavy training
  topics keep a short, searchable landing page without re-typing the deck into Markdown.

## User scenarios
1. **Employee** opens Knowledge Base → sees articles grouped by category on the left (Vercel-style),
   opens one → it renders on the right with the active title bold + navy underline; can search.
2. **Admin** opens Admin → Knowledge Base → New article → copies the prompt, runs it in Claude with a
   topic + source, pastes the output, presses Parse, reviews, and publishes.
3. **Admin** edits or unpublishes an article; changes reflect for employees.

## Functional requirements
- **FR-001**: Employees MUST see published articles grouped by category and open any to read it.
- **FR-002**: The reader MUST render Markdown with GFM tables, callout boxes, and mermaid diagrams.
- **FR-003**: Employees MUST be able to search articles (title, category, summary, body).
- **FR-004**: Admins MUST be able to create/edit/delete articles and toggle `published`.
- **FR-005**: The admin MUST show a copyable authoring prompt and parse pasted front-matter
  (title, category, summary, reading_minutes) into fields; body is the remaining Markdown.
- **FR-006**: `category` is free-text so new topics need no code change.
- **FR-006a**: Admins MUST be able to **arrange** the order of topics and of articles within a topic (up/down); the employee view reflects that order. Topic order derives from its lowest-ordered article; moves renumber `order` canonically (no schema change).
- **FR-006b**: The employee left nav presents topics as **collapsible** groups with a distinct (navy) topic title, so it stays compact as topics grow; the active article's topic is expanded by default and search expands all matches.
- **FR-007**: The 3 former handbook sections (Strategy Consulting, AI-Strategy Consulting,
  Assignment Phases) MUST move to the Knowledge Base and no longer appear in the Handbook.
- **FR-008**: Money/PII rules are not involved; standard admin gating applies (HR/Super User).
- **FR-009**: Admins MAY attach one **PDF deck** to an article (upload/replace/remove); it is stored in
  Vercel Blob and validated server-side (PDF only, ≤25MB). The employee reader renders the blurb, then
  embeds the deck below it with a download link. Replacing or deleting an article cleans up the old blob.

## Key entities
- **KnowledgeArticle**: id, slug (unique), title, category, summary?, body (Markdown), readingMinutes?,
  attachmentUrl?/attachmentName?/attachmentType?/attachmentSize? (optional PDF deck),
  published, order, authorId?, timestamps.

## Success criteria
- **SC-001**: An admin can stand up a new article end-to-end (prompt → paste → publish) without a developer.
- **SC-002**: A published article renders its tables, callouts, and diagrams correctly for employees.
- **SC-003**: The Handbook shows only the 7 operating sections after the split.

## Notes / later
- Attachments/images per article; merge with the Phase-2 Learning Track; per-article "mark as read".
