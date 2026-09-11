# Workflow: Supabase lead intake (polling)

File: `supabase-lead-intake-polling.json`

Lead-aligned automation for `public.leads` and `public.lead_processing_audit`.
Once per minute it polls eligible leads, atomically claims each lead through
`claim_lead_for_processing`, transitions status through `transition_lead_status`,
writes a `triaged` audit row, and closes the claim with `complete_lead_processing`.

The workflow imports as **inactive** (`active: false`) and does nothing until
you activate it manually.

Legacy job workflows remain in `legacy-supabase-job-intake-*.json` for reference
only.

## What it does

| Node | Action |
| --- | --- |
| `Schedule Trigger` | Runs once per minute |
| `Supabase — fetch eligible leads` | `GET /rest/v1/leads` with `automation_state=eq.idle` and `status=eq.new` |
| `Split lead results` | Expands the PostgREST JSON array into one item per lead |
| `Supabase — claim lead processing` | `POST /rest/v1/rpc/claim_lead_for_processing` |
| `Claim succeeded?` | Continues only on `true` |
| `Supabase — transition lead status` | `POST /rest/v1/rpc/transition_lead_status` → `in_progress` |
| `Supabase — audit triaged` | `POST /rest/v1/lead_processing_audit` with versioned idempotency key |
| `Supabase — complete lead processing` | `POST /rest/v1/rpc/complete_lead_processing` |

Only `id`, `status`, `automation_state`, `automation_attempt`, and `created_at`
are fetched. Contact fields and descriptions never enter n8n execution data.

The `false` branch of `Claim succeeded?` is intentionally unwired: duplicate or
ineligible claims stop normally without raising an error.

## Import

1. Open n8n at <http://localhost:5678>.
2. **Workflows → Import from File**.
3. Select `automation/workflows/supabase-lead-intake-polling.json`.
4. Save the workflow. Do not activate yet.

## Placeholder URL

Replace `YOUR_PROJECT_REF` in every HTTP node:

| Node | Endpoint |
| --- | --- |
| `Supabase — fetch eligible leads` | `/rest/v1/leads` |
| `Supabase — claim lead processing` | `/rest/v1/rpc/claim_lead_for_processing` |
| `Supabase — transition lead status` | `/rest/v1/rpc/transition_lead_status` |
| `Supabase — audit triaged` | `/rest/v1/lead_processing_audit` |
| `Supabase — complete lead processing` | `/rest/v1/rpc/complete_lead_processing` |

## Credentials

Use a **Supabase API** credential with the `service_role` key. The key is never
committed to Git.

Apply these migrations before the first run:

- `supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql`
- `supabase/migrations/20260911200000_create_lead_automation_rpcs.sql`

## Error workflow (manual step)

Assign `Supabase lead intake — error handler`
(`supabase-lead-intake-error-handler.json`) in the intake workflow
**Settings → Error Workflow**. This assignment is not stored in the JSON export.

See `automation/workflows/lead-error-handler-README.md`.

## Manual retry after failure

When automation fails, operators can requeue a lead from the dashboard
(**Retry automation**). That calls `retry_lead_automation`, increments
`automation_attempt`, and preserves every previous audit row. The next poll uses
a new idempotency key: `lead.created:<lead_id>:attempt:<automation_attempt>`.

Stale `automation_state=processing` rows are not retried automatically. Resolve
the open claim first.

## What this workflow does not claim

- **Not end-to-end exactly-once.** Atomic single-winner claim plus duplicate
  suppression per attempt; processing may still fail after a successful claim.
- **Not active after import.**
- **No public webhook, Kafka, or hosted n8n wiring.**
- **No credentials, tokens, project refs, or chat IDs in Git.**
