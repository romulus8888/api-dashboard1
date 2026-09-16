# Demo script: 2–3 minute walkthrough

A short screen recording of the **hosted bilingual demo**: synthetic intake,
authenticated operator dashboard, and optional n8n claim/fail/retry.

Public URL:

`https://api-dashboard-demo-preview-rom22.vercel.app`

## Before recording

- Use **synthetic data only**. Never a real client request.
- Reset synthetic demo data from the dashboard so the list is the standard
  10-lead seed.
- Keep n8n **inactive** until the automation segment. On a shared n8n host,
  activate only `Supabase lead intake (polling)`. Do not touch legacy jobs
  workflows.
- Confirm Error Workflow is assigned to the lead intake workflow.
- Open tabs in advance: `/en`, `/en/login`, `/en/dashboard`, n8n executions,
  Telegram bot chat (full screen). Zoom the browser to about 125%.
- Close unrelated tabs, notifications, and anything personal.

Prepared SQL (leave unexecuted until the audit beat):

```sql
select step, outcome, idempotency_key, workflow_execution_id, error_message, created_at
from public.lead_processing_audit
order by created_at desc
limit 8;
```

## Never on screen

- Supabase `service_role`, Vercel env, n8n credential pages, `.env` files.
- Telegram bot token and BotFather.
- Operator password; type it off-camera or use a password manager fill with
  the field blurred if needed.
- Real emails, names, or request text.
- Prefer the dashboard over the Supabase project URL bar if you want the
  project ref private.

If a secret appears, stop and re-record that segment.

## Sequence

### 0:00–0:20 — Public intake

**Screen:** `/en` with the prototype warning visible. Switch EN/RU once, then
back to EN. Complete Turnstile and generate a synthetic lead.

**Say:** "This is a prototype intake pipeline. Visitors create synthetic demo
leads only. The form is bilingual, bot-protected, and rate-limited. It does
not accept arbitrary contact fields from the browser."

### 0:20–0:45 — Operator dashboard

**Screen:** `/en/login` → `/en/dashboard`. Point at the new synthetic lead,
then Funnel metrics and an overdue badge.

**Say:** "Operators sign in. The dashboard lists leads through authenticated
APIs, not the anon key. Status, owner, comments, and funnel metrics are
enforced in Postgres."

### 0:45–1:15 — n8n success path

**Screen:** n8n `Supabase lead intake (polling)` turning green on a scheduled
run (wait up to one minute). Then the dashboard: status `in_progress`,
automation succeeded.

**Say:** "n8n polls once a minute. Before work it calls a Postgres function
that atomically claims the lead. The first caller continues; a duplicate
claim returns false and stops. That guarantee lives in the database, not in
the workflow."

Point at `Claim succeeded?`.

### 1:15–1:35 — Audit trail

**Screen:** SQL result (or dashboard history) showing `received` and
`triaged` with the same execution id.

**Say:** "The audit trail is append-only and closed to the browser. Each step
carries the n8n execution ID."

### 1:35–2:15 — Deliberate failure and retry

**Screen:** break `Supabase — transition lead status` (append `-broken` to the
RPC URL), generate one more synthetic lead, wait for the scheduled failure,
then restore the URL immediately.

Dashboard: `needs_review`, Retry. Click Retry once. Next poll completes
attempt 2.

**Say:** "If a step fails after the claim, the Error Workflow marks the lead
needs review. The operator retries from the dashboard. The next poll uses a
new attempt key. Retry is implemented; it is not automatic from import
alone — Error Workflow must be assigned in n8n Settings."

Do **not** use editor Execute workflow to demonstrate the Error Workflow.

### 2:15–2:35 — Telegram

**Screen:** bot chat with workflow name, execution id, failed node, short
error. No contact fields.

**Say:** "The same failure can alert Telegram with workflow and execution
metadata only. No client payload and no credentials."

### 2:35–3:00 — Closing

**Screen:** dashboard after **Reset synthetic data**, n8n workflows inactive.

**Say:** "The Next.js app is on Vercel; n8n stays off except during a watched
run. It polls — there is no public webhook. The claim RPC gives a
single-winner intake per attempt, not end-to-end exactly-once."

## After recording

- Confirm the broken RPC URL is restored.
- Deactivate lead intake on the shared n8n host.
- Reset synthetic demo data.
- Watch the recording full screen for keys, tokens, emails, and personal
  notifications before publishing.

## Trimmed 60-second version

Keep: Turnstile generate, dashboard after login, green n8n run, audit rows,
Telegram on failure. One sentence on the atomic claim over `Claim succeeded?`.
Drop SQL detail and the closing reset if time is tight.
