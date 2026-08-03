# HR_ERP — Handoff Checklist (actions only you can do)

> Claude Code sessions can't reach your Neon DB, Vercel, or Google Cloud. This file collects
> everything you need to do to run the app. It grows as the build proceeds; do it all at the end.

## 1. Database (now automatic)
**As of the migration runner, you no longer paste SQL into Neon.** On every Vercel
deploy, `scripts/apply-sql.mjs` runs (in the `build` step) and applies any not-yet-applied
`prisma/sql/NNN_*.sql` files in order, tracked in a `_sql_migrations` table so each runs once.
It uses `DATABASE_URL_UNPOOLED` (set in Vercel). Files 000–005 that you applied by hand are
auto-baselined on first run; everything new (006+) applies on deploy. You can also run it
locally with `npm run db:apply` (needs a DB URL in the env).

The files below are kept for reference / manual fallback (paste in numeric order if ever needed):
- [ ] `000_initial_schema.sql` — creates all tables/enums.
- [ ] `001_seed_onboarding.sql` — the onboarding activities (no PII; in the repo).
- [ ] `002_seed_handbook.sql` — the 10 handbook sections (company-internal; in the repo).
- [ ] `003_seed_benefits.sql` — benefits config: ceilings, guaranteed amounts, medical rate card, catalog, open plan year (in the repo).
- [ ] `004_benefits_categories.sql` — adds the basket `category` column + the full categorized catalog (run after 003).
- [ ] `005_knowledge_base.sql` — creates the Knowledge Base table, moves the 3 consulting sections out of the Handbook, and seeds the first articles (run after 002).
- [ ] `006_onboarding_8week.sql` — onboarding v2 (stage → free text, 8-week structure + check-ins). *(auto-applied)*
- [ ] `007_handbook_policies.sql` — Handbook policy sections (Office & Workplace, Time Off, Expenses, Conduct, Confidentiality, IT) + policy→tool buttons. *(auto-applied)*
- [ ] `008_handbook_bullets.sql` — reformat handbook operating sections to bullets. *(auto-applied)*
- [ ] `009_knowledge_topics.sql` — recluster KB into topics + placeholder "coming soon" topics. *(auto-applied)*
- [ ] `010_handbook_enrich.sql` — enrich Brand/Structure/Docs handbook content. *(auto-applied)*
- [ ] `011_knowledge_clusters.sql` — add the KB cluster level (Cluster → Topic → Article). *(auto-applied)*
- [ ] `012_knowledge_attachments.sql` — add the optional PDF-deck attachment columns to KB articles. *(auto-applied)*
- [ ] `013_incentive_scheme.sql` — Incentive Scheme tables (cycles/people/assignments/contributions). *(auto-applied)*
- [ ] `014_user_password.sql` — add `passwordHash` for email + password sign-in. *(auto-applied)*
- [ ] `015_module_flags.sql` — module on/off release switch. *(auto-applied)*
- [ ] `016_leave_decision_seen.sql` — Time-Off: `decisionSeenAt` for the in-app decision badge. *(auto-applied)*
- [ ] `017_brand_settings.sql` — Branding: single-row `BrandSettings` (name, logo, colors). *(auto-applied)*
- [ ] `018_benefit_claims.sql` — Benefits: claim policy + `BenefitClaim` (reimbursement flow). *(auto-applied)*

**Team members (employees):** you no longer need a PII SQL seed. Sign in (see §1a),
open **Admin → Employees → Import CSV**, and upload your employee spreadsheet saved as
CSV. Rows are matched by email (added or updated); dates are read in the sheet's own
formats and anything ambiguous/unreadable is listed after import so you can fix it in the
person's profile. Only **Name** and **Email** are required.

## 1a. Sign-in — email + password and/or Google
The sign-in panel offers **email + password** and **Continue with Google** (the Google
button appears once `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set, §3). Both match the
same employee by email and land on the dashboard.
- **Set team passwords:** Admin → Employees → open a person → **Sign-in password** card:
  type one or leave blank to generate a temporary one, **shown once** to hand over (no
  emails in v1). Employees can change their own on **Profile**.
- **Bootstrap admin bridge** (still active as a fallback): **`Islam` / `1234`** — on first
  login it creates your account as an active **Super User**. Override via
  `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_EMAIL` /
  `BOOTSTRAP_ADMIN_NAME`. **Change the password before real use**; remove the bootstrap
  vars to retire the bridge once real passwords/Google are in place.

## 1b. Releasing modules & the Incentive Scheme
- **Modules switch:** Admin → **Modules** (super user) turns each module on/off — off means
  hidden from nav and its pages redirect home. Build in the background, release when ready.
- **Incentive Scheme** (super user only, hidden): a partner-compensation engine at
  `/incentive`. Per cycle, download the CSV templates, fill, upload (people / assignments /
  contributions) + enter firm P&L; all figures compute server-side. Not the employee
  Benefits module.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)
Set these (see `.env.example` for the shape):
- [ ] `POSTGRES_URL`, `DATABASE_URL_UNPOOLED` — from Neon (the Vercel↔Neon integration can set these automatically).
- [ ] `AUTH_SECRET` — `openssl rand -base64 32`.
- [ ] `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — from Google Cloud (step 3).
- [ ] `ALLOWED_EMAIL_DOMAIN` = `forefront.consulting`.
- [ ] `ADMIN_EMAILS` = your email (bootstrap Super User), comma-separated for more.
- [ ] `BLOB_READ_WRITE_TOKEN` — from Vercel Blob (Storage tab).

## 3. Google OAuth (Google Cloud Console)
- [ ] Create an OAuth 2.0 Client ID (Web application).
- [ ] Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local).
- [ ] Copy the client ID/secret into the env vars above.
- [ ] (Optional) Restrict the OAuth consent screen to your Google Workspace org.

## 4. Vercel
- [ ] Connect the `islamsaadany/HR_ERP` repo, set the env vars, deploy.
- [ ] Add Vercel Blob storage (for My Documents / Resources uploads).

## Notes
- **Personal documents** are stored in Vercel Blob with public-but-unguessable URLs; the app only
  ever exposes an authorized download route (`/api/documents/[id]`) that checks owner/HR. Good for
  v1; if you need hard private storage later, revisit.
- Sign-in is refused for anyone without a matching, active employee record — seed the team first.
- The 6 employees with placeholder external emails can't sign in until you set their real
  `@forefront.consulting` emails (update the seed or edit them in the app once you can sign in).
