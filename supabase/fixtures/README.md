# Disposable test fixtures (local / CI only)

These files exist so active lead/demo migrations and verification can run on an
**isolated PostgreSQL instance** without hosted Supabase.

**Never apply to hosted Supabase or production.**

## Clean install track

`disposable-test-prerequisites.sql` provides Supabase-compatible roles and
minimal Auth stubs. It does **not** create `public.jobs`.

```bash
export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/validate-disposable-database.sh clean all
```

## Legacy compatibility track

Legacy jobs stubs and migrations live under `supabase/legacy/`. Validate on a
**separate database** so the clean track is not contaminated:

```bash
export DISPOSABLE_TEST_ACK=yes
createdb postgres_legacy
export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres_legacy
bash scripts/validate-disposable-database.sh legacy all
```

## Trust boundary (actor attribution)

`transition_lead_status` is executable only by `service_role` in Phase 1. PostgreSQL cannot prevent `service_role` from supplying any validated operator id. The migration enforces:

- `NULL` `changed_by` means system automation;
- non-null `changed_by` must reference an **active** `operator_profiles` row at write time;
- Phase 3 server authorization will verify the authenticated user before invoking the RPC.
