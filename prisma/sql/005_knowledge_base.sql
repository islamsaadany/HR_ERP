-- HR_ERP Knowledge Base (spec 008) — table + seed articles mined from the Onboarding Kit.
-- Run on a database that already applied 000 + 002. Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "readingMinutes" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_category_idx" ON "KnowledgeArticle"("category");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_published_idx" ON "KnowledgeArticle"("published");

-- Move the 3 consulting sections out of the Handbook (now Knowledge Base articles).
UPDATE "HandbookSection" SET active=false WHERE slug IN ('strategy-consulting','ai-strategy-consulting','assignment-phases');

INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_strategy_intro','strategy-consulting-intro','Strategy Consulting Intro','Strategy Consulting','What strategy consulting is at Forefront, and how this section is organized.','## Key takeaways
- Consulting is about helping clients **think and decide better** — not just delivering documents.
- Clients hire us for **know-how, capacity, and an objective outside view**.
- Master the fundamentals here before your first assignment: scopes, domains, skills, pillars, and the golden rules.

## What this section covers
Strategy consulting is how we help organizations build, deploy, and execute their strategic plans. These reads walk through the essentials every Forefront consultant should internalize:

- **Why clients hire consultants** — the real reasons behind an engagement.
- **Consulting scopes & types** — how engagements are shaped.
- **Consulting domains** — the areas we work across.
- **Consultant essential skills** — the hats you wear.
- **The 6 core pillars** — the behaviours that earn trust.
- **Golden rules: questions & answers** — how to carry yourself in the room.

> [!TIP] Read these in order the first time, then keep them as a quick reference before client meetings.',3,true,0,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_why_hire','why-clients-hire-consultants','Why clients hire consultants','Strategy Consulting','The core reasons organizations bring in outside strategy help.','## Key takeaways
- Clients rarely hire for one reason — it is usually a mix of **know-how, capacity, and dynamics**.
- Your value is the **outside, objective perspective** as much as the technical answer.

## The three reasons
| Reason | What the client is really buying |
|---|---|
| **Technical know-how** | Expertise, frameworks, and experience they do not have in-house. |
| **Time & capacity** | Bandwidth to do the work without pulling their team off the day job. |
| **Political dynamics** | A neutral, credible outsider who can say what insiders cannot, and align stakeholders. |

> [!KEY] When you understand *which* of these is driving the engagement, you know how to position your work and where to focus.',3,true,1,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_scopes','consulting-scopes-and-types','Consulting scopes & types','Strategy Consulting','How engagements differ by involvement and time frame — from project-based to retainer and interim.','## Key takeaways
- Engagements vary along two axes: **depth of involvement** and **time frame**.
- Common shapes: **project-based**, **deployment support**, **retainer**, and **interim management**.

## The scope types
- **Project based** — a defined, deep piece of work with a clear start and end.
- **Deployment support** — helping the client put a strategy into action.
- **Retainer model** — ongoing, lighter-touch support over a longer horizon.
- **Interim management** — stepping into a high-level role for a period.

| Type | Involvement | Time frame |
|---|---|---|
| Project based | Deep | Short / defined |
| Deployment support | Deep | Medium |
| Retainer model | Lighter | Long |
| Interim management | High (in-role) | Defined period |',3,true,2,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_domains','consulting-domains','Consulting domains','Strategy Consulting','The domains we work across — strategy, functional, and role-based.','## Key takeaways
- We work across three broad domains: **Strategy**, **Functional**, and **Role-based**.

## Domains
- **Strategy** — Formulation, Deployment, Retainer, Interim.
- **Functional** — Marketing, Finance, Supply Chain, Product, Technology.
- **Role based** — Investment, Growth, Expansion.',2,true,3,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_skills','consultant-essential-skills','Consultant essential skills','Strategy Consulting','The four hats every consultant wears in an engagement.','## Key takeaways
- A consultant is more than an analyst — you move between four roles.

## The four roles
- **Educator** — bring knowledge and teach the client team.
- **Facilitator / Coach** — draw out the room, guide discussions, build capability.
- **Project manager** — keep the work on track, on time, and organized.
- **Strategist** — see the big picture and shape the direction.

> [!TIP] Strong consultants read the moment and switch hats deliberately.',2,true,4,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_pillars','consultant-6-core-pillars','The 6 core pillars','Strategy Consulting','The six behaviours that build client trust.','## Key takeaways
- Trust is earned through consistent behaviour, captured in six pillars.

## The pillars
1. **Integrity**
2. **Commitment**
3. **Credibility**
4. **Objectivity**
5. **Professionalism**
6. **Adaptability**

> [!KEY] Objectivity is what clients cannot get internally — protect it.',2,true,5,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_golden','golden-rules-questions-answers','Golden rules: questions & answers','Strategy Consulting','How to carry yourself in the room — the rules, the questions to ask, and honest answers.','## Key takeaways
- Stay composed, stay curious, and never over-claim.

## The rules
- **Do not get surprised** — anticipate, prepare, keep your composure.
- **Do not answer a question you were not asked** — stay on point.
- **Do not get consumed more than your client** — keep perspective and energy.
- **Never say "I told you so"** — it never helps.

## Good questions to ask
- "Why do you say this?"
- "Can you tell me more?"
- "Why is this relevant?"

## Honest answers
- "We tried this at ..."
- "It depends on ..."
- "I do not know." — said honestly, it builds trust.

> [!WARNING] Bluffing an answer you do not have is the fastest way to lose credibility.',3,true,6,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_ai_intro','ai-strategy-consulting-intro','AI-Strategy Consulting Intro','AI-Strategy Consulting','How we apply AI across a strategy assignment — the eight areas.','## Key takeaways
- AI is a force-multiplier across the assignment lifecycle — from research to proposal.
- Each use is driven by a clear **case** and a well-crafted **prompt**.

## The eight areas
1. **Market & industry intelligence** — quick, organized overviews of a market before a client meeting.
2. **Data organization & compilation** — structuring scattered inputs.
3. **Articulation & content enrichment** — sharpening and expanding drafts.
4. **Verification of analytical outcomes** — sanity-checking analysis.
5. **Application of frameworks** — applying the right models.
6. **Frameworks refinement** — adapting models to the context.
7. **Business-case creation** — building the numbers and the story.
8. **Proposal development** — assembling client-ready proposals.

> [!NOTE] Every AI use stays anchored to real client context — never put confidential client data into external AI tools.

> [!TIP] A good prompt states the **role**, the **context**, the exact **output** you want, and the **depth** (e.g. "at least 1500 words, organized and categorized, with key terminology").',4,true,0,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_phases','assignment-phases-overview','Assignment phases at a glance','Assignment Phases','The four phases of a strategy assignment — Offering, Planning, Deployment, Execution.','## Key takeaways
- A strategy assignment runs through four phases, each with its own objectives, outcomes, and deliverables.
- Each phase only succeeds if the previous one achieved real alignment and buy-in.

```mermaid
flowchart LR
  A[01 Offering] --> B[02 Planning] --> C[03 Deployment] --> D[04 Execution]
```

## The phases
| # | Phase | Focus |
|---|---|---|
| 01 | **Offering** | Co-develop or validate the ambition, core offerings, and competitive positioning. |
| 02 | **Planning** | Build the full strategic framework and translate it into a measurable roadmap. |
| 03 | **Deployment** | Integrate the strategy into systems, processes, governance, and performance tools. |
| 04 | **Execution** | Support rollout, track performance, coach, and adapt to sustain momentum. |

### What each phase produces
- **Offering** -> formal proposal; new community relationships.
- **Planning** -> strategic plan (foundation, situation analysis, competitive strategy, tactical plans).
- **Deployment** -> master plan, governance plan, initiatives plan, process docs (SOPs / SLAs / RASCI).
- **Execution** -> C-level action plans and master-plan feedback.

> [!KEY] Alignment compounds: weak buy-in early makes every later phase harder.',4,true,0,now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body=EXCLUDED.body, "readingMinutes"=EXCLUDED."readingMinutes", "order"=EXCLUDED."order", "updatedAt"=now();

COMMIT;
