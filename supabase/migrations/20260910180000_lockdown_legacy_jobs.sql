-- ============================================================================
-- Phase 5: lock down legacy public.jobs browser access.
--
-- IMPORTANT ROLLOUT ORDER (not atomic with Vercel deploy):
--   1. Apply leads schema + demo rate-limit migrations.
--   2. Provision an active operator profile and Auth user (see docs/deployment-runbook.md).
--   3. Deploy the API-based authenticated dashboard and verify sign-in + lead review.
--   4. Only then apply THIS migration to revoke browser access to public.jobs.
--
-- Rollback note:
--   To restore the pre-lockdown browser jobs dashboard (not recommended after cutover),
--   re-grant SELECT/INSERT/UPDATE on public.jobs to anon/authenticated and drop the
--   policies below. Existing rows are never deleted by this migration.
-- ============================================================================

alter table public.jobs enable row level security;

revoke all on table public.jobs from public;
revoke all on table public.jobs from anon;
revoke all on table public.jobs from authenticated;

-- Closed by default: no policies for anon/authenticated.
-- service_role retains existing grants for n8n automation.

comment on table public.jobs is
  'Legacy intake table. Browser access revoked in Phase 5; retained for n8n automation only.';
