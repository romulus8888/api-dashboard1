# Demo script: 2–3 minute walkthrough

A short screen recording that shows the intake pipeline working end to end,
including a deliberate failure. Aimed at a client or a hiring manager who will
watch without sound at first and turn it on if the first fifteen seconds are
worth it.

## Before recording

- Use **test data only**: made-up company names and addresses on
  `@example.com`. Never a real client request.
- Apply the migration, start n8n, import both workflows, connect credentials and
  send `/start` to the Telegram bot so the alert can be delivered.
- Open the tabs in advance: intake form, dashboard, Supabase SQL Editor, n8n
  editor, Telegram. Switching tabs is faster than loading pages on camera.
- Close unrelated tabs, notifications and anything personal in the browser.
- Prepare the SQL query in the editor, unexecuted, so you only press Run:

```sql
select step, outcome, workflow_execution_id, error_message, created_at
from public.job_processing_audit
order by created_at desc
limit 5;
```

- Zoom the browser to roughly 125% so text stays readable in compressed video.

## Never on screen

- The Supabase `service_role` key: the credential page in n8n, the Supabase API
  settings page, any `.env` file.
- The Telegram bot token and the BotFather chat.
- Real client emails, names or request text — including old rows in the
  dashboard or in query results. Clear them or filter to your test row.
- Your Supabase project ref if you prefer to keep it private: keep the SQL
  Editor in view rather than the project URL bar.
- Anything from your personal Telegram chat list; open the bot chat full screen.

If a secret appears by accident, stop the recording and start that segment
again. Do not rely on editing it out.

## Sequence

### 0:00–0:20 — Opening on the form

**Screen:** the intake form, fields already filled with test data.

**Say:** "This is an automated intake pipeline for incoming project requests.
A client submits a request here, and from that point everything is handled
automatically: the request is claimed exactly once, its status is updated, and
every step is recorded."

Submit the form and let the success toast appear.

### 0:20–0:40 — The request lands in Supabase

**Screen:** the dashboard with the new request visible as `pending`, then the
Supabase table view or SQL result showing the same row.

**Say:** "The request is stored in Supabase with the status `pending`. The
browser only ever uses the public anon key — it has no access to anything
technical."

### 0:40–1:10 — The workflow runs

**Screen:** the n8n intake workflow, then Execute or the scheduled run turning
green node by node.

**Say:** "n8n polls for pending requests once a minute. Before doing any work it
calls a Postgres function that atomically claims the request. The first caller
gets `true` and continues; a retry or a second worker gets `false` and stops.
That guarantee lives in the database, as a unique constraint, not in the
workflow."

Point at the `Claim succeeded?` node while saying the last sentence.

### 1:10–1:35 — Status and audit trail

**Screen:** the dashboard showing the request as `in_progress`, then the SQL
result with the audit rows.

**Say:** "The status is now `in_progress`, and the audit trail shows two rows:
the intake claim, closed as succeeded, and the triage step. Both carry the n8n
execution ID, so any run can be traced. The audit table is closed to the
frontend entirely — row-level security with no policies."

### 1:35–2:15 — Simulated failure

**Screen:** the n8n editor, changing one URL after the claim node to a broken
endpoint, then the failing execution.

**Say:** "Now let's break it on purpose. I'll point one step at an endpoint that
does not exist and submit another test request."

Show the red execution, then the audit query again.

**Say:** "The run fails after the claim, so a request would normally be left in
limbo. Instead the error workflow marks the open claim as `failed` and records
which node broke. A row still sitting in `processing` always means work that
started and never finished."

### 2:15–2:40 — Telegram alert

**Screen:** the Telegram chat with the alert message.

**Say:** "The same failure sends an alert with the workflow name, execution ID,
the failing node and a short error message. No client data and no credentials
ever go into the notification."

### 2:40–3:00 — Closing

**Screen:** the repository README, scrolled to the architecture diagram.

**Say:** "Everything here is documented and reproducible: the SQL migration, the
Docker setup for n8n and both workflows. Current scope is honest about itself —
it polls rather than using a public webhook, and it runs locally. The next step
would be a public HTTPS endpoint and a CRM integration, which the claim function
already makes safe against duplicate deliveries."

## After recording

- Restore the broken URL in the workflow (see
  `automation/workflows/error-handler-README.md`).
- Delete the test requests and their audit rows if the project is connected to a
  real Supabase instance.
- Watch the recording once at full screen and check every frame for keys,
  tokens, emails and personal notifications before publishing.

## Trimmed 60-second version

If a shorter clip is needed for a profile page, keep: form submission, the
workflow turning green, the audit rows, and the Telegram alert. Drop the SQL
detail and the closing section, and state the idempotency guarantee in one
sentence over the workflow shot.
