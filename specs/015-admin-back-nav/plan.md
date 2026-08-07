# Implementation Plan: Consistent Admin Back Navigation

**Branch**: `claude/hr-erp-benefits-coverage-rates-hnaox1` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

## Summary

A single shared presentational `BackLink` component (navy/gold muted "←" link, the existing
`/admin/modules` style) placed at the top of every admin page **except** the Admin home. Each page
passes its **structural parent** path + label per the spec's parent map. The scattered ad-hoc back
links (Modules, CSV Import, Release a benefit, Knowledge new/edit, Departments) are replaced by it.
No data model, no routing change — purely additive UI consistency, admin-area only.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Primary Dependencies**: `next/link`
**Storage**: N/A (no data)
**Testing**: `npx tsc --noEmit` + `npm run build`; visual walk of the parent map
**Project Type**: Web application
**Constraints**: Reuse the exact existing link style (`text-sm text-muted hover:text-ink`); admin-only; no visual redesign

## Constitution Check

- **I. Align Before Building** — ✅ Behavior (structural up-one-level), style (reuse existing), scope (admin-only), and the full parent map were pre-confirmed.
- **II. UI Changes Require Explicit Approval** — ✅ Explicitly requested; reuses the existing link pattern (no new visual language). Snapshot every edited page to `ui-versions/` first.
- **III / IV / V** — ✅ No money rules; no schema; docs updated in the same commit; one shared component removes duplication (DRY).

**Result: PASS.**

## Project Structure

```text
src/
├── components/admin/
│   └── BackLink.tsx                 # NEW — shared muted "←" link (href + label)
└── app/(app)/admin/
    ├── page.tsx                     # unchanged (root — no back link)
    ├── employees/{page,new,[id],import}  # + BackLink to parent
    ├── onboarding/{page,new,[id]}
    ├── handbook/{page,new,[id]}
    ├── knowledge/{page,new,[id]}    # new/[id] already have ad-hoc links → replace
    ├── benefits/{page,release}      # release has ad-hoc link → replace
    ├── time-off/page.tsx
    ├── announcements/page.tsx
    ├── brand/page.tsx
    ├── modules/page.tsx             # ad-hoc link → replace
    └── departments/page.tsx         # ad-hoc link → replace
```

**Structure Decision**: One shared component; each page renders `<BackLink href label />` as the first
element of its root. The component carries its own small bottom margin so pages need no per-eyebrow
spacing tweaks. Section pages → `/admin` ("Admin"); nested pages → their section list (section name).

## Complexity Tracking

> No violations.
