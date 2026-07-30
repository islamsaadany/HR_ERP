-- HR_ERP handbook enrichment (markdown + mermaid) from the Onboarding Kit. Runner-applied, idempotent.
BEGIN;
UPDATE "HandbookSection" SET body='Forefront is organized into **Top Management** plus three teams — **Consulting**, **Data**, and **Marketing**.

```mermaid
flowchart TD
  TM[Top Management]
  TM --> C[Consulting]
  TM --> D[Data]
  TM --> M[Marketing]
  C --> C1[Consultant]
  C --> C2[Senior Consultant]
  C --> C3[Lead Consultant]
  C --> C4[Business Development]
  D --> D1[Data Head]
  D --> D2[Data Analyst]
  M --> M1[Marketing Manager]
  M --> M2[Social Media Specialist]
  M --> M3[Brand Manager]
  M --> M4[Graphic Designer]
  M --> M5[Photographer]
```

## Consulting team
| Role | Job purpose |
|---|---|
| Consultant | Execute consulting work — interviews, workshops, deliverables, follow-ups. |
| Senior Consultant | Advanced strategic thinking; oversee projects; mentor consultants. |
| Lead Consultant | Assignment owner and single point of contact for scope, cadence, and outcomes. |
| Business Development | Grow the pipeline via referrals, partnerships, and outreach. |

## Data team
| Role | Job purpose |
|---|---|
| Data Head | Lead the data practice; translate business questions into robust analytics. |
| Data Analyst | Build and run the analysis behind the data work. |

## Marketing team
| Role | Job purpose |
|---|---|
| Marketing Manager | Drive content strategy, personal branding, and channel performance. |
| Social Media Specialist | Publish content, manage community, keep the calendar on track. |
| Brand Manager | Own positioning, voice, and visual identity; the quality gate. |
| Graphic Designer | Produce on-brand visuals and templates. |
| Photographer | Capture and edit photo/video assets; manage the media library. |', "updatedAt"=now() WHERE slug='structure-roles';
UPDATE "HandbookSection" SET body='## Brand values
- **Integrity** — we operate with honesty, transparency, and respect.
- **Quality** — quality is built into our practices, from concept to action.
- **Commitment** — we give 100%, fully dedicated to being the best we can and delivering as planned.
- **Agility** — we tailor our offering to customer stage, size & needs, with flexible, dynamic execution.
- **Hands-On Impact** — we work side-by-side with clients to turn strategy into action.

## How we position
- Our value discipline is **Customer Intimacy** — customer-focused, tailoring our offering to each client''s needs and localizing the strategic tools.

## Who we serve
**Client goals**
- Develop a strategic mindset in the team and involve them in building the strategy.
- Achieve team alignment for success.
- Optimize organizational performance and efficiency.
- Ensure structured, sustainable growth (or achieve a turnaround).
- Gain competitive advantage through advanced strategic insight.

**Pain points we solve**
- Internal inefficiencies hindering success.
- Lack of clear strategy and structured growth.
- Hard decisions amid overwhelming or conflicting data.
- Team alignment and harmony.

## Where we show up
- Social media (LinkedIn & Facebook), business websites, email, and WhatsApp.', "updatedAt"=now() WHERE slug='brand-positioning';
UPDATE "HandbookSection" SET body='Every assignment lives in a standard **[Client Name] Data Hub** with a fixed folder tree and naming convention.

## Folder tree
```mermaid
flowchart TD
  H["Client Data Hub"]
  H --> A[01 Project Initiation]
  H --> B[02 Working Files]
  H --> C[03 Final Deliverables]
  H --> D[04 Reference and Archives]
  H --> E[05 Photos and Media]
```
For multi-scope assignments, folders 01–03 split by **Scope 1 (202x)** and **Scope 2 (202x)** — or just the year for retainers.

## What goes in each folder
| Folder | Usual content |
|---|---|
| 01 Project Initiation | Collaboration scope & objectives; deliverable samples; planned timeline. |
| 02 Working Files | Workshop outcomes; research findings; call & interview notes; analysis; planning files; client team work. |
| 03 Final Deliverables | Situational analysis reports; strategy document; final tactical plan; master plan. |
| 04 Reference & Archives | Templates; references & resources; business-understanding research. |
| 05 Photos & Media | Photos/video captured for documentation or marketing. |

## Files & access
- Name files with the **[Client Name]** prefix and a clear type (e.g. "[Client Name] Collaboration Slides").
- Set access per file — typically **project team, view-only** unless wider access is needed.', "updatedAt"=now() WHERE slug='documentation-system';
UPDATE "HandbookSection" SET body='### Who we are
- A Strategy Consulting Firm guiding businesses (SMEs & Large) to build, deploy & execute their strategic plans.
- Through situational analysis, planning workshops & execution practices.
- With an edge of strategy specialty, a guidance approach, and execution support — backed by data-driven offerings.

### Our purpose
- Empower organizations and teams to align, collaborate, and perform to their maximum potential.
- Ensure structured and sustainable business growth.

### Our aspiration
- Be one of the top recognized strategy consulting firms in Egypt, with solid partnerships in the region.

### North star
- 2026: 8 high-value retainers
- 2027: 12 high-value retainers
- 2028: 16 high-value retainers

### Valued behaviours
- **Be an Autonomous Owner** — take full responsibility for outcomes; be proactive and self-driven.
- **Learn & Grow All the Time** — invest in learning; listen deeply; reflect and run small experiments.
- **Stay Organized & Committed** — plan, follow the systems and templates, deliver high-quality work on time.
- **Feel Well with Purpose** — care for people and yourself; speak honestly; protect your energy; know your ''why''.', "updatedAt"=now() WHERE slug='strategic-foundation';
UPDATE "HandbookSection" SET body='- HR is managed with **ENGAGE Consulting** (policies, payroll, benefits administration).

### Benefit scheme
- **Fixed benefits (full-time):** Marriage Allowance; Loans (after 1 year, one month''s salary); Summer Allowance (Jul–Sep); Professional Development; Special Events Support.
- **Benefits basket (full-time):** a yearly value that grows with tenure, allocated across Gym, Mobile Device, Personal Medical Insurance, and Schooling; up to 50% may go to a single benefit.
- **Part-time:** a proportional package with up to 2 basket benefits.
- Build your basket in the Benefits module.

### Policies
- **Data privacy:** treat all client information as confidential unless marked public; share need-to-know; never repurpose client data without consent; never put confidential data into external AI tools.
- **Document sharing:** grant least-privilege access; classify Public / Internal / Confidential; avoid public sharing; revoke access when people leave a project.', "updatedAt"=now() WHERE slug='people-governance';
COMMIT;
