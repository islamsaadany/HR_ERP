# HR_ERP — Forefront HR

Internal HR platform for **Forefront Consulting**. Google SSO (company domain only), three
roles (Employee / HR Admin / Super User), and the v1 modules: Foundation (registry + My
Documents), Onboarding, Team Directory, Handbook & Resources, Time-Off, Benefits, Dashboard.

> Steered by the four-file system + spec-kit. Read `CLAUDE.md`, `PROJECT_DETAILS.md`,
> `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PROGRESS.md`, and `specs/` before working here.

## Stack
Next.js 15.5 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL (Neon) ·
NextAuth v5 (Google) · Tailwind v4 · Vercel Blob · Vercel.

## Local setup
```bash
npm install
cp .env.example .env        # fill in real values
npm run db:generate         # generate the Prisma client
npm run dev                 # http://localhost:3000
```

### Verify (no DB needed)
```bash
npm run typecheck           # tsc --noEmit
npm run build               # production build
```

## Database (Neon)
Claude Code sessions cannot reach the production DB. Schema/data are applied by pasting the
numbered files in `prisma/sql/` into Neon's SQL editor, in order:

1. `prisma/sql/000_initial_schema.sql` — creates the schema.
2. Team seed data (real employee PII) is delivered as a **gitignored** `seed_data_*.sql` file,
   handed over separately — never committed.

## Auth / env
See `.env.example`. Sign-in is restricted to `ALLOWED_EMAIL_DOMAIN`; bootstrap admins are set
via `ADMIN_EMAILS`. Employees are pre-registered by HR — accounts with no registry record are
refused (no auto-provisioning).

## Design
Navy/gold design language (Tailwind theme tokens in `src/app/globals.css`).
