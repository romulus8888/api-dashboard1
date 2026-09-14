# Deployment and release runbook

This document covers **hosted Supabase + Vercel + optional local n8n** rollout. It is **not** physically atomic across providers.

**CI/disposable verification** (GitHub Actions + `scripts/validate-disposable-database.sh`) proves migrations and `supabase/verify/*.sql` on **PostgreSQL 16 with fixture stubs only**. It does **not** deploy to hosted Supabase, configure Vercel secrets, or exercise Turnstile, Telegram, or n8n. Treat CI green as a prerequisite, not a substitute for hosted smoke tests below.

## A. Before you start (hosted)

1. **Export / back up production `public.jobs` schema and data** if legacy jobs still exist. The repository does not ship the real production jobs baseline; disposable CI uses a minimal stub in `supabase/fixtures/disposable-test-prerequisites.sql` only.
2. Confirm the target Supabase project and Vercel project. Store credentials in your team secret manager — never commit them.
3. Run disposable validation locally or wait for CI on the release branch:

```bash
export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/validate-disposable-database.sh
```

## B. Hosted database — apply additive migrations first

Apply **in timestamp order** from `supabase/migrations/`:

1. `20260814000000_create_job_processing_audit.sql` (requires real `public.jobs` on hosted — export baseline first if missing)
2. `20260910120000_create_lead_schema_and_status_history.sql`
3. `20260910140000_create_demo_rate_limit.sql`
4. `20260911140000_atomic_lost_reason_in_transition.sql`
5. `20260911180000_create_lead_metrics_rpc.sql`
6. `20260911200000_create_lead_automation_rpcs.sql`
7. `20260912140000_create_reset_demo_data_rpc.sql`

**Do not** apply `supabase/fixtures/disposable-test-prerequisites.sql` to hosted Supabase.

**Do not** apply `20260910180000_lockdown_legacy_jobs.sql` until step F passes.

Optional hosted SQL checks (manual, on staging or after deploy):

- `supabase/verify/phase1_lead_schema.sql` through `phase9_demo_reset.sql` as appropriate for the migrations applied (rollback-safe scripts; run in SQL editor on a disposable clone when possible).

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

## F. Legacy jobs lockdown (only after E passes)

Apply:

- `20260910180000_lockdown_legacy_jobs.sql`

Then verify:

```sql
-- supabase/verify/phase5_jobs_lockdown.sql (rollback-safe)
```

Confirm the dashboard still works via admin APIs (no browser `jobs` access).

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
| Migration chain | Yes | Apply same files to Supabase |
| `supabase/verify/*.sql` | Yes | Run on staging clone when possible |
| Next.js build + unit tests | Yes | Vercel deploy |
| Operator login + dashboard | No | Section E |
| Turnstile / demo intake | No | Section H |
| Jobs lockdown timing | Yes (verify script) | Section F after E |
| n8n / Telegram | No | Section G–H |
