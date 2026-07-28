-- HR_ERP handbook seed (company-internal, no personal PII — safe to commit). Run after 000.
BEGIN;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_strategic_foundation','strategic-foundation','Strategic Foundation','Who we are, our purpose, aspiration, and valued behaviours.','WHO WE ARE
We are a Strategy Consulting Firm that guides businesses (SMEs & Large) to build, deploy & execute their strategic plans — through situational analysis, planning workshops & execution practices, with an edge of strategy specialty, a guidance approach, and execution support, supported by data-driven offerings.

OUR PURPOSE
To empower organizations and teams to align, collaborate, and perform to maximum potential, ensuring structured and sustainable business growth.

OUR ASPIRATION
To be one of the top recognized strategy consulting firms in Egypt with solid partnerships in the region.

NORTH STAR
2026: 8 high-value retainers · 2027: 12 · 2028: 16.

VALUED BEHAVIOURS
- Be an Autonomous Owner — take full responsibility for outcomes; be proactive and self-driven.
- Learn & Grow All the Time — invest in learning; listen deeply; reflect and run small experiments.
- Stay Organized & Committed — plan, follow the systems and templates, deliver high-quality work on time.
- Feel Well with Purpose — care for people and yourself; speak honestly; protect your energy; know your ''why''.',0,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_structure_roles','structure-roles','Structure & Roles','How Forefront is organized and what each role does.','Forefront is organized into Consulting, Data, and Marketing teams, plus Top Management.
Consulting: Consultant, Senior Consultant, Lead Consultant, Business Development.
Data: Data Head, Data Analyst.
Marketing: Marketing Manager, Social Media Specialist, Brand Manager, Graphic Designer.
Each role has a clear job purpose and top responsibilities — see the source deck under Resources for the full matrix.',1,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_brand_positioning','brand-positioning','Brand Positioning','Our competitive position and brand values.','Our positioning and brand values guide how we show up with clients and the community. See the source deck under Resources for the full brand section.',2,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_internal_meetings','internal-meetings','Internal Meetings','Our meeting cadence and gatherings.','Our cadence keeps us aligned, learning, and accountable:
- Team Standup
- Learning Circle
- Consultants Squad
- Strategy Reviews',3,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_management_tools','management-tools','Management Tools','The tools we run on.','- G-Suite — collaboration ecosystem (Email, Drive, Docs).
- Telegram — communication hub.
- ClickUp — project command center (tasks, timelines).',4,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_documentation_system','documentation-system','Documentation System','Folder trees, file naming, and project files.','Every assignment follows a standard folder tree and file-naming convention — from project initiation through working files, final deliverables, references & archives, and media. Multi-scope assignments have their own structure. See the source deck under Resources for the templates.',5,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_people_governance','people-governance','People Governance','HR, the benefit scheme, and our policies.','HR is managed with ENGAGE Consulting (policies, payroll, benefits administration).

BENEFIT SCHEME
Fixed Benefits (full-time): Marriage Allowance; Loans (after 1 year, one month''s salary); Summer Allowance (Jul–Sep); Professional Development; Special Events Support.
Benefits Basket (full-time): a yearly value that increases with tenure, allocated across Gym, Mobile Device, Personal Medical Insurance, and Schooling. Up to 50% of the basket may go to a single benefit.
Part-time: a proportional package with up to 2 basket benefits.
Build your basket in the Benefits module.

POLICIES
- Data privacy: treat all client information as confidential unless marked public; share on a need-to-know basis; never repurpose client data without consent; never put confidential data into external AI tools.
- Document sharing: grant least-privilege access; classify Public / Internal / Confidential; avoid public sharing; revoke access when people leave a project.',6,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_strategy_consulting','strategy-consulting','Strategy Consulting','Why clients hire us, scopes, domains, skills, and golden rules.','Why clients hire consultants, consulting scope types and domains, essential consultant skills, the 6 core pillars, and our golden rules for questions & answers. See the source deck under Resources for the full detail.',7,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_ai_strategy_consulting','ai-strategy-consulting','AI-Strategy Consulting','How we use AI across an assignment.','How we apply AI across the assignment lifecycle:
1. Market & industry intelligence
2. Data organization and compilation
3. Articulation and content enrichment
4. Verification of analytical outcomes
5. Application of frameworks
6. Frameworks refinement
7. Business-case creation
8. Proposal development',8,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"order",active,"createdAt","updatedAt") VALUES ('hb_assignment_phases','assignment-phases','Assignment Phases','The phases of a strategy assignment.','The ideal phases for a strategy assignment — each with its description, objectives, outcomes, and deliverables. See Documentation System and the source deck under Resources for detail.',9,true,now(),now()) ON CONFLICT (slug) DO NOTHING;
COMMIT;
