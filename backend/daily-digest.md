# Daily feedback digest â€” prepared, not deployed

The scheduler uses Supabase Postgres directly: pg_cron calls private SQL, and
pg_net posts one digest to the existing private FormSubmit Ajax endpoint. There
is no new Edge Function, `daily-digest.ts`, external scheduler, paid service, API
key, or Vault secret to deploy. Existing mail settings are reused without
printing or copying their values.

## Deployment order

1. Deploy the updated `backend/index.ts` to the existing public intake function,
   retaining its existing name and public/no-JWT gateway configuration. No
   frontend change is necessary. Visitor intake still stores first and keeps
   all existing origin, payload, field, honeypot, dedupe and database limits.
2. As database owner (`postgres`), enable Cron (`pg_cron`) and `pg_net` in the
   Supabase Dashboard if not already enabled. Apply `backend/daily-digest.sql`
   in one transaction. It does not modify the existing endpoint or enable mail.
   Reapplying updates the named cron jobs, not duplicate job names.
3. Check only non-secret settings and scheduler state:

   ```sql
   select mail_enabled, mail_endpoint is not null as endpoint_configured,
          inbox_url like 'https://supabase.com/dashboard/project/%' as private_inbox
   from feedback_private.settings where id;
   select jobname,schedule,active from cron.job
   where jobname in ('feedback-daily-noon-rome','feedback-digest-reconcile');
   select local_day,state,item_count,excerpt_count,page_count,page_lines,
          response_status,created_at,completed_at
   from feedback_private.digest_runs order by local_day desc limit 14;
   ```

4. If mail was intentionally disabled, enable it only when ready:

   ```sql
   update feedback_private.settings set mail_enabled=true where id;
   ```

5. After the next noon run, inspect `digest_runs` and `cron.job_run_details`.
   Run Supabase security/performance advisors. Do not select raw settings,
   request queues, or response bodies into logs: the queue temporarily contains
   the endpoint and feedback text. Confirm actual Gmail receipt separately;
   an HTTP acknowledgment alone does not prove inbox delivery.

## Behavior

- The hourly UTC cron checks `Europe/Rome` hour 12. That is 11:00 UTC in winter,
  10:00 UTC in summer. A unique Rome date and transaction advisory lock reserve
  at most one attempt per local day, including repeated/manual executions.
- No new suggestions: records `empty`, sends nothing. Suggestions arriving
  after that snapshot wait until tomorrow. If mail is disabled, no claim is
  consumed. A missed noon due to project pause/outage waits until next noon.
- The first run includes all existing feedback, including messages previously
  covered only by the old per-message notification. Subsequent runs include
  every saved ID not covered by a **confirmed** earlier digest, regardless of
  feedback status and `created_at`. This explicit membership watermark avoids
  losing concurrent inserts with older timestamps. Do not delete original inbox
  rows while a digest is being built if full originals must remain available.
- One email contains total suggestion/page counts, per-page counts with page
  labels capped at 80 characters, and oldest-first excerpts (at most 100,
  240 characters each) with page and Rome timestamp. Actual JSON payload is
  capped at 48,000 UTF-8 bytes. For large backlogs, remaining pages and messages
  have explicit aggregate counts; individual excerpts/page lines are honestly
  reported as omitted. All full messages remain in the private inbox.
- Polling every minute marks `confirmed` only for HTTP 2xx **and** JSON
  `success: true` or `success: "true"`, without timeout/network error. This means
  provider acceptance; filtering, Gmail delivery and later bounces remain
  outside this backend's visibility.
- Non-confirmed response, timeout, missing response or crash does not advance
  membership. There is **no resend on the same day**. After ten minutes a
  response-less request is marked `ambiguous` and a still-queued request is
  removed. Its suggestions join the next day's digest. A send accepted before
  its acknowledgment was lost can therefore recur in tomorrow's summary.
  Exactly-once delivery cannot be guaranteed without provider idempotency.
- The response table is unlogged and defaults to six-hour retention. The minute
  reconciliation normally records acceptance before expiry. A long outage can
  lose this evidence; the safe outcome is `ambiguous`, never guessed success.
- The existing FormSubmit HTTPS Ajax hostname/path is allowlisted; changing
  provider requires code review. No endpoint value was retrieved during prep.

## Stop / rollback

To pause future digests, set `mail_enabled=false` as owner. This does not cancel
an already submitted provider request. To disable only these jobs:

```sql
select cron.unschedule(jobid) from cron.job
where jobname in ('feedback-daily-noon-rome','feedback-digest-reconcile');
```

Keep inbox, digest history and membership tables. Do not restore immediate mail
unless explicitly desired: the legacy claim function intentionally returns NULL.
No inbox RLS or public intake grants are changed by this addition. Scheduler
functions use `SECURITY INVOKER`, empty search paths and owner-only execution.

## Local verification

From the workspace root:

```powershell
npm ci --prefix work/digest-validation
node work/digest-validation/test.mjs
```

The test loads the original intake schema and actual digest SQL in PGlite
Postgres, mocking only extensions/HTTP transport and the test clock. It verifies
SQL compilation, no empty email, daily idempotence, boolean/string provider
success, non-confirmed responses, backdated inserts, winter/summer noon, stale
queue removal, a 551-message Unicode backlog under the payload cap, and role
denial. Actual hosted cron, pg_net worker and provider delivery remain deployment
checks, not claimed as locally verified.

Sources checked 2026-11-18: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault),
[changelog](https://supabase.com/changelog.md).

## Deployment record

Installed on the dedicated Melvor Wiki Feedback project on 2026-11-18. Intake version 2 removes immediate mail; both private cron jobs are active. Rome-time gating, anon permission denial and intake persistence were verified live. Actual Gmail receipt of the first scheduled daily digest is pending the next noon with new feedback. Local Postgres tests cover empty days, DST, membership, ambiguous sends and bounded Unicode payloads.
