# Legacy Supabase upgrade path

**Never apply these files to a fresh demo Supabase project.**

This directory preserves SQL for installations that already have `public.jobs` and
the job-processing audit stack. A **new** hosted project should apply only
`supabase/migrations/` (lead/demo system) after Supabase Auth is available.

## Contents

| Path | Purpose |
| --- | --- |
| `fixtures/legacy-jobs-stub.sql` | Disposable CI stub for `public.jobs` (local/CI only) |
| `migrations/20260814000000_create_job_processing_audit.sql` | Audit table + `claim_job_for_processing()` |
| `migrations/20260910180000_lockdown_legacy_jobs.sql` | Revoke browser access to `public.jobs` |
| `verify/phase5_jobs_lockdown.sql` | Static privilege verification after lockdown |

## Upgrade order (existing project with `public.jobs`)

1. Export/back up production `public.jobs` if needed.
2. Apply active lead migrations from `supabase/migrations/` in timestamp order.
3. Provision operators and deploy the authenticated dashboard (see `docs/deployment-runbook.md`).
4. Apply `migrations/20260910180000_lockdown_legacy_jobs.sql` only after dashboard verification.
5. Run `verify/phase5_jobs_lockdown.sql` on a disposable clone when possible.

If `job_processing_audit` is missing on a legacy project, apply
`migrations/20260814000000_create_job_processing_audit.sql` **before** the lead
migrations, with a real `public.jobs` baseline already present.

## Disposable CI

Legacy compatibility is validated in isolation on a **separate database** via:

```bash
export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres_legacy
bash scripts/validate-disposable-database.sh legacy all
```

Do not copy `fixtures/` or `legacy/migrations/` into `supabase/migrations/`.
