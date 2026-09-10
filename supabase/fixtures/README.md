# Disposable test fixtures (local / CI only)

These files exist so Phase 1 migrations and verification can run on an **isolated PostgreSQL instance** without hosted Supabase or a production `public.jobs` export.

**Never apply to hosted Supabase or production.**

## Why this exists

- `20260814000000_create_job_processing_audit.sql` requires `public.jobs`, but the repository does not yet contain a production jobs baseline migration.
- Phase 1 references `auth.users` for operators. A disposable database needs minimal Auth stubs.

The complete production migration chain is **not** reproducible from this repository until the real `public.jobs` DDL is exported.

## Apply order (fresh disposable database)

```bash
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/fixtures/disposable-test-prerequisites.sql \
  -f supabase/migrations/20260814000000_create_job_processing_audit.sql \
  -f supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql \
  -f supabase/verify/phase1_lead_schema.sql
```

## Trust boundary (actor attribution)

`transition_lead_status` is executable only by `service_role` in Phase 1. PostgreSQL cannot prevent `service_role` from supplying any validated operator id. The migration enforces:

- `NULL` `changed_by` means system automation;
- non-null `changed_by` must reference an **active** `operator_profiles` row at write time;
- Phase 3 server authorization will verify the authenticated user before invoking the RPC.
