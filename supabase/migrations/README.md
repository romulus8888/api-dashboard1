# Production migrations

Files in this directory are **timestamped, ordered SQL migrations** intended for hosted Supabase after review.

**Do not** copy files from `supabase/fixtures/` into this directory. Fixtures are disposable-test stubs only and are applied exclusively by `scripts/validate-disposable-database.sh` (CI/local) or documented disposable runbooks — never as production migrations.

Apply order: sort by filename (`YYYYMMDDHHMMSS_*.sql`).

Disposable CI/local validation applies every file here automatically after `supabase/fixtures/disposable-test-prerequisites.sql`.
