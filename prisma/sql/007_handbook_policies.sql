-- HR_ERP handbook policy sections + policy->tool buttons (spec 004/008). Runner-applied, idempotent.
BEGIN;
ALTER TABLE "HandbookSection" ADD COLUMN IF NOT EXISTS "actionLabel" TEXT;
ALTER TABLE "HandbookSection" ADD COLUMN IF NOT EXISTS "actionHref" TEXT;
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_office_workplace','office-workplace','Office & Workplace','How we work day-to-day — location, hybrid, and dress.','WORKPLACE
- Hybrid — work from anywhere, no fixed office hours.
- Be reachable during working hours and keep your calendar current.
- Office details and access are shared with you in your first week.

DRESS CODE
- Business casual.
- Dress smart when you''re client-facing.',NULL,NULL,10,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_time_off','time-off','Time Off','How time off works here.','- No fixed leave allowance, sick days, or set hours.
- Want time off? Request it in the Time-Off tool.
- Make sure your work is covered and nothing urgent falls that day.
- If something urgent comes up, arrange cover with a peer or your manager.
- Submit the request at least 2 weeks before.','Request time off','/time-off',11,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_expenses','expenses','Expenses & Reimbursement','Petty cash and reimbursement.','- Need to buy something for work? Confirm with your manager first.
- Then ask Finance for petty cash.
- Already paid yourself? Submit a reimbursement request.
- Reimbursement is processed right after you submit.',NULL,NULL,12,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_code_of_conduct','code-of-conduct','Code of Conduct & Ethics','How we behave.','- Act with integrity and respect.
- Zero tolerance for harassment or discrimination.
- Avoid conflicts of interest; disclose them early.
- Represent Forefront professionally with clients and partners.',NULL,NULL,13,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_confidentiality','confidentiality','Confidentiality & Client Data','Protecting client information.','- Treat all client information as confidential unless marked public.
- Share on a need-to-know basis.
- Never repurpose client data without consent.
- Never put confidential data into external AI tools.',NULL,NULL,14,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
INSERT INTO "HandbookSection" (id,slug,title,summary,body,"actionLabel","actionHref","order",active,"createdAt","updatedAt") VALUES ('hb_it_security','it-security','IT & Acceptable Use / Data Security','Devices, accounts, and data.','- Use company accounts and approved tools for work.
- Keep devices locked and software up to date.
- Protect client and company data; follow the confidentiality rules.
- Report anything suspicious (a lost device, phishing) to your manager.',NULL,NULL,15,true,now(),now()) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body, "actionLabel"=EXCLUDED."actionLabel", "actionHref"=EXCLUDED."actionHref", "order"=EXCLUDED."order", active=true, "updatedAt"=now();
UPDATE "HandbookSection" SET "actionLabel"='Choose your benefits', "actionHref"='/benefits', "updatedAt"=now() WHERE slug='people-governance';
COMMIT;
