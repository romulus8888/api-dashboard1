# Workflow: Supabase lead intake — error handler

File: `supabase-lead-intake-error-handler.json`

Error handler for `Supabase lead intake (polling)`. When the main workflow fails,
this workflow marks the open claim through `fail_lead_processing`, moves the lead
to `needs_review`, and attempts a Telegram alert.

## What it does

| Node | Action |
| --- | --- |
| `Error Trigger` | Receives failed execution metadata |
| `Supabase — fail lead processing` | `POST /rest/v1/rpc/fail_lead_processing` |
| `Telegram — notify lead intake failure` | Sends workflow / execution / node / bounded error text |

`Error Trigger` fans out to **both** nodes in parallel. A Supabase failure does
not block the Telegram attempt.

`fail_lead_processing` returns the affected claim count. `0` is normal when no
open claim exists (failure before claim or a fully completed execution).
Completed claims for the same execution id remain untouched.

## Manual setup

1. Import `supabase-lead-intake-error-handler.json`.
2. In the lead intake workflow, open **Settings → Error Workflow** and select this workflow.
3. Create a **Telegram API** credential in n8n and attach it to the Telegram node.
4. Replace `YOUR_TELEGRAM_CHAT_ID` with your chat id.
5. Replace `YOUR_PROJECT_REF` in the Supabase node.

No bot token, service role key, or chat id is committed to Git.

## Verification (manual, disposable DB)

After applying migrations, run:

`supabase/verify/phase8_lead_automation.sql`

Then import both workflows locally, assign the error workflow, and execute one
failed run to confirm Telegram delivery and `needs_review` status history.
