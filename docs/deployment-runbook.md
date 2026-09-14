# Deployment and release runbook

This document covers **hosted Supabase + Vercel + optional local n8n** rollout. It is **not** physically atomic across providers.

**CI/disposable verification** (GitHub Actions + `scripts/validate-disposable-database.sh`) proves migrations and `supabase/verify/*.sql` on **PostgreSQL 16** using two **isolated** database tracks:

- **Clean track** — fresh demo install (no `public.jobs`)
- **Legacy track** — separate database with legacy jobs fixtures + `supabase/legacy/` SQL

CI does **not** deploy to hosted Supabase, configure Vercel secrets, or exercise Turnstile, Telegram, or n8n. Treat CI green as a prerequisite, not a substitute for hosted smoke tests below.

## A. Before you start (hosted)

1. Decide which path applies:
   - **New dedicated demo Supabase project** — apply **only** `supabase/migrations/` (clean install). Do **not** apply `supabase/fixtures/` or anything under `supabase/legacy/`.
   - **Existing project with `public.jobs`** — follow the legacy upgrade path in `supabase/legacy/README.md` after backing up jobs data.
2. Confirm the target Supabase project and Vercel project. Store credentials in your team secret manager — never commit them.
3. Run disposable validation locally or wait for CI on the release branch:

```bash
export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/validate-disposable-database.sh clean all
```

Legacy upgrade validation (separate database — do not reuse the clean DB):

```bash
createdb postgres_legacy
export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres_legacy
bash scripts/validate-disposable-database.sh legacy all
```

## B. Hosted database — clean demo project (active migrations only)

Apply **in timestamp order** from `supabase/migrations/`:

1. `20260910120000_create_lead_schema_and_status_history.sql`
2. `20260910140000_create_demo_rate_limit.sql`
3. `20260911140000_atomic_lost_reason_in_transition.sql`
4. `20260911180000_create_lead_metrics_rpc.sql`
5. `20260911200000_create_lead_automation_rpcs.sql`
6. `20260912140000_create_reset_demo_data_rpc.sql`

**Do not** apply `supabase/fixtures/disposable-test-prerequisites.sql` to hosted Supabase.

**Do not** apply `supabase/legacy/` SQL to a clean demo project.

Optional hosted SQL checks (manual, on staging or after deploy):

- `supabase/verify/phase1_lead_schema.sql` through `phase11_clean_install.sql` (rollback-safe scripts; run on a disposable clone when possible).

## B2. Hosted database — legacy upgrade (existing `public.jobs`)

See `supabase/legacy/README.md`. Summary:

1. Ensure `public.jobs` exists (export/back up first).
2. Apply `supabase/legacy/migrations/20260814000000_create_job_processing_audit.sql` if audit is missing.
3. Apply active lead migrations from `supabase/migrations/`.
4. Deploy dashboard and verify operators (section E).
5. Apply `supabase/legacy/migrations/20260910180000_lockdown_legacy_jobs.sql` only after E passes.
6. Run `supabase/legacy/verify/phase5_jobs_lockdown.sql` on a disposable clone when possible.

## C. Auth and operators (hosted Supabase)

1. Open **Authentication → Providers → Email**
2. **Disable sign ups** (provisioned operators only)
3. Keep email/password sign-in enabled
4. Create one Auth user per operator; copy each UUID
5. Insert active operator profiles:

```sql
insert into public.operator_profiles (id, display_name, is_active)
values ('<auth-user-uuid>', 'Demo Operator', true)
on conflict (id) do update
  set display_name = excluded.display_name,
      is_active = true;
```

Store passwords only in your secret manager.

## D. Vercel environment (server + auth + Turnstile)

Set on the Vercel project (Production and Preview as needed):

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Build + Runtime | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + Runtime | Browser session only |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Admin APIs, demo generation, RPCs |
| `TURNSTILE_SECRET_KEY` | Server only | Demo intake verification |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Build + Runtime | Widget |
| `DEMO_RATE_LIMIT_SECRET` | Server only | Rate-limit bucket hashing |

CI uses placeholder values only; do not copy CI env vars to production.

## E. Deploy and verify authenticated leads dashboard

1. Deploy the release branch to Vercel
2. Sign in at `/en/login` and `/ru/login` with a provisioned operator
3. Confirm `/en/dashboard` and `/ru/dashboard` load leads via `/api/admin/leads`
4. Change a lead status and confirm persistence
5. Confirm funnel metrics load (`/api/admin/metrics`)
6. Sign out; confirm unauthenticated dashboard access redirects to login
7. Optional: run synthetic demo reset from the dashboard (replaces `is_synthetic=true` leads only)

## F. Legacy jobs lockdown (legacy upgrade path only; after E passes)

Apply:

- `supabase/legacy/migrations/20260910180000_lockdown_legacy_jobs.sql`

Then verify:

```sql
-- supabase/legacy/verify/phase5_jobs_lockdown.sql (rollback-safe)
```

Confirm the dashboard still works via admin APIs (no browser `jobs` access).

Skip this section entirely on a **clean demo project** that never had `public.jobs`.

## F2. Decommission or revoke the old Supabase project

After the new Vercel deployment is verified against the **dedicated demo** Supabase project:

1. Rotate or revoke API keys on the **old** Supabase project so stale browser bundles cannot keep using its URL/anon key.
2. Prefer full decommission if the old project is retired.
3. Old public JS bundles may retain embedded `NEXT_PUBLIC_*` values until users hard-refresh; treat key rotation as mandatory, not optional.

## G. n8n (local / optional automation)

1. Start local stack: `automation/README.md`
2. Import workflows from `automation/workflows/` as **inactive**
3. Configure Supabase `service_role` credential in n8n only (never in Git or `NEXT_PUBLIC_*`)
4. Manually assign the **Error Workflow** in the n8n UI for the intake workflow
5. Activate polling only when ready for synthetic test traffic
6. See `automation/workflows/README.md` and `lead-error-handler-README.md`

CI does not start n8n or call Telegram.

## H. Hosted synthetic smoke tests (human)

After E–G as applicable:

1. Submit a **synthetic** demo lead from the public form (Turnstile + rate limit)
2. With n8n active, confirm lead automation claim/complete or `needs_review` on failure
3. Retry failed automation from the dashboard if needed
4. Reset synthetic demo data from the dashboard; confirm real leads unchanged

## I. Rollback and incident steps

| Situation | Action |
| --- | --- |
| Dashboard broken after deploy | Roll back Vercel deployment; confirm operator auth and env vars |
| Lockdown broke legacy clients | **Emergency only:** `grant select, insert, update on public.jobs to anon, authenticated;` — prefer fixing admin APIs |
| Bad migration on hosted | Restore from Supabase backup/PITR; do not run disposable fixtures on production |
| Demo reset runaway | Concurrent resets return HTTP 409; only `is_synthetic=true` rows are deleted |
| n8n alert storm | Deactivate workflows; fix Error Workflow assignment and credentials |

## J. What CI proves vs what humans must prove

| Check | CI (disposable Postgres 16) | Hosted verification |
| --- | --- | --- |
| Clean migration chain (no jobs) | Yes (isolated DB) | Apply `supabase/migrations/` only |
| Legacy upgrade chain | Yes (separate DB) | Follow `supabase/legacy/README.md` |
| `supabase/verify/*.sql` | Yes (clean track) | Run on staging clone when possible |
| `supabase/legacy/verify/*.sql` | Yes (legacy track) | After lockdown on legacy installs |
| Next.js build + unit tests | Yes | Vercel deploy |
| Operator login + dashboard | No | Section E |
| Turnstile / demo intake | No | Section H |
| Jobs lockdown timing | Yes (verify script) | Section F after E |
| n8n / Telegram | No | Section G–H |
