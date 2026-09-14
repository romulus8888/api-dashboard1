# Production migrations (clean demo install)

Files in this directory are **timestamped, ordered SQL migrations** for a **fresh**
Supabase project running the lead/demo dashboard. They do **not** create
`public.jobs` or `public.job_processing_audit`.

**Do not** copy files from `supabase/fixtures/` or `supabase/legacy/` into this
directory. Fixtures are disposable-test stubs only. Legacy SQL is for existing
installations that already have `public.jobs` — see `supabase/legacy/README.md`.

Apply order: sort by filename (`YYYYMMDDHHMMSS_*.sql`).

Disposable CI/local validation applies this directory on the **clean** track after
`supabase/fixtures/disposable-test-prerequisites.sql`. Legacy upgrade SQL is
validated separately on an isolated database.
