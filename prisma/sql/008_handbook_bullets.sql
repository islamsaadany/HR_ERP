-- HR_ERP handbook operating sections reformatted to bullet points. Runner-applied, idempotent.
BEGIN;
UPDATE "HandbookSection" SET body='WHO WE ARE
- A Strategy Consulting Firm guiding businesses (SMEs & Large) to build, deploy & execute their strategic plans.
- Through situational analysis, planning workshops & execution practices.
- With an edge of strategy specialty, a guidance approach, and execution support — backed by data-driven offerings.

OUR PURPOSE
- Empower organizations and teams to align, collaborate, and perform to their maximum potential.
- Ensure structured and sustainable business growth.

OUR ASPIRATION
- Be one of the top recognized strategy consulting firms in Egypt, with solid partnerships in the region.

NORTH STAR
- 2026: 8 high-value retainers
- 2027: 12 high-value retainers
- 2028: 16 high-value retainers

VALUED BEHAVIOURS
- Be an Autonomous Owner — take full responsibility for outcomes; be proactive and self-driven.
- Learn & Grow All the Time — invest in learning; listen deeply; reflect and run small experiments.
- Stay Organized & Committed — plan, follow the systems and templates, deliver high-quality work on time.
- Feel Well with Purpose — care for people and yourself; speak honestly; protect your energy; know your ''why''.', "updatedAt"=now() WHERE slug='strategic-foundation';
UPDATE "HandbookSection" SET body='- Organized into Consulting, Data, and Marketing teams, plus Top Management.
- Consulting: Consultant · Senior Consultant · Lead Consultant · Business Development.
- Data: Data Head · Data Analyst.
- Marketing: Marketing Manager · Social Media Specialist · Brand Manager · Graphic Designer.
- Each role has a clear job purpose and top responsibilities — see the source deck under Resources for the full matrix.', "updatedAt"=now() WHERE slug='structure-roles';
UPDATE "HandbookSection" SET body='- Our positioning and brand values guide how we show up with clients and the community.
- See the source deck under Resources for the full brand section.', "updatedAt"=now() WHERE slug='brand-positioning';
UPDATE "HandbookSection" SET body='- Our cadence keeps us aligned, learning, and accountable.
- Team Standup
- Learning Circle
- Consultants Squad
- Strategy Reviews', "updatedAt"=now() WHERE slug='internal-meetings';
UPDATE "HandbookSection" SET body='- G-Suite — collaboration ecosystem (Email, Drive, Docs).
- Telegram — communication hub.
- ClickUp — project command center (tasks, timelines).', "updatedAt"=now() WHERE slug='management-tools';
UPDATE "HandbookSection" SET body='- Every assignment follows a standard folder tree and file-naming convention.
- Covers project initiation, working files, final deliverables, references & archives, and media.
- Multi-scope assignments have their own structure.
- See the source deck under Resources for the templates.', "updatedAt"=now() WHERE slug='documentation-system';
UPDATE "HandbookSection" SET body='- HR is managed with ENGAGE Consulting (policies, payroll, benefits administration).

BENEFIT SCHEME
- Fixed Benefits (full-time): Marriage Allowance; Loans (after 1 year, one month''s salary); Summer Allowance (Jul–Sep); Professional Development; Special Events Support.
- Benefits Basket (full-time): a yearly value that grows with tenure, allocated across Gym, Mobile Device, Personal Medical Insurance, and Schooling; up to 50% may go to a single benefit.
- Part-time: a proportional package with up to 2 basket benefits.
- Build your basket in the Benefits module.

POLICIES
- Data privacy: treat all client information as confidential unless marked public; share need-to-know; never repurpose client data without consent; never put confidential data into external AI tools.
- Document sharing: grant least-privilege access; classify Public / Internal / Confidential; avoid public sharing; revoke access when people leave a project.', "updatedAt"=now() WHERE slug='people-governance';
COMMIT;
