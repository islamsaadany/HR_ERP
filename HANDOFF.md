# HR_ERP — Handoff Checklist (actions only you can do)

> Claude Code sessions can't reach your Neon DB, Vercel, or Google Cloud. This file collects
> everything you need to do to run the app. It grows as the build proceeds; do it all at the end.

## 1. Database (Neon SQL editor)
Paste these files from `prisma/sql/` into Neon, **in numeric order**:
- [ ] `000_initial_schema.sql` — creates all tables/enums.
- [ ] `001_seed_onboarding.sql` — the onboarding activities (no PII; in the repo).
- [ ] `seed_data_team.sql` — the 19 real employees + dependants (delivered separately; **gitignored**, contains PII).

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
