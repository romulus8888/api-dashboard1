# Phase 5 deployment runbook

This rollout spans Supabase and Vercel. **It is not physically atomic.** Follow the order below.

## 1. Apply database migrations (hosted Supabase)

Apply, in order:

1. `20260910120000_create_lead_schema_and_status_history.sql`
2. `20260910140000_create_demo_rate_limit.sql`
3. Deploy and verify the authenticated dashboard (steps 2–4 below)
4. **Only after dashboard verification:** `20260910180000_lockdown_legacy_jobs.sql`

Do **not** apply the jobs lockdown migration before the API-based dashboard works.

## 2. Disable public signup (Supabase Auth)

In the Supabase project dashboard:

1. Open **Authentication → Providers → Email**
2. Disable **Enable sign ups**
3. Keep email/password sign-in enabled for provisioned operators only

## 3. Provision one active demo operator (private)

Never commit credentials to Git.

1. Create an Auth user in Supabase (**Authentication → Users → Add user**) with a strong password
2. Copy the user's UUID
3. Insert an active operator profile (SQL editor or migration fixture in a private environment):

```sql
insert into public.operator_profiles (id, display_name, is_active)
values ('<auth-user-uuid>', 'Demo Operator', true)
on conflict (id) do update
  set display_name = excluded.display_name,
      is_active = true;
```

Store the email/password in your team secret manager only.

## 4. Configure environment variables (Vercel)

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Auth verification + session cookies only in the browser)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only admin APIs and demo generation)
- Turnstile + demo rate-limit secrets for public synthetic intake

## 5. Deploy and verify

1. Deploy the branch with localized `/en/login` and `/ru/login`
2. Sign in with the provisioned operator
3. Confirm `/en/dashboard` and `/ru/dashboard` load leads via `/api/admin/leads`
4. Change a lead status and confirm it persists
5. Sign out and confirm unauthenticated dashboard access redirects to login
6. Run `supabase/verify/phase5_jobs_lockdown.sql` after applying the lockdown migration

## 6. Roll back jobs lockdown (emergency only)

If you must temporarily restore legacy browser jobs access:

```sql
grant select, insert, update on public.jobs to anon, authenticated;
```

Re-deploy only if you also revert the dashboard client. Prefer fixing operator auth instead.
