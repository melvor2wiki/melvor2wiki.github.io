# Daily feedback summary

Private pg_cron / pg_net scheduler: 12:00 Europe/Rome, including daylight saving time. No new service, secret or paid resource. Intake only stores suggestions and retains its existing server limits.

Every day sends a summary, including days with zero new suggestions. Email shows the number not yet covered by a confirmed daily summary, complete-history count, per-page counts, up to 100 excerpts and View all suggestions (the private Supabase table). Full messages remain in that table; no public read endpoint exists. The history count covers retained inbox rows; deleting rows reduces that count.

One real attempt per Rome day. Acknowledgment advances membership only for confirmed normal runs. Ambiguous delivery can repeat messages tomorrow. A private, owner-only preview is limited to one per hour and marked TEST; preview membership never consumes the noon summary. Preview and regular runs have separate uniqueness rules. No public preview endpoint or credential is added.

Payload stays below 48 KB. Empty summaries still include meaningful count/history text. Large backlogs use explicit omitted-excerpt/page counts. A Free project paused at noon can miss that day; next available noon resumes. Provider acceptance does not itself prove Gmail delivery.

Deployment: apply daily-digest.sql as postgres after the intake update. Named cron jobs are updated rather than duplicated. Settings remain private and are never copied to the repository. Monitor only digest_runs metadata and cron job status; do not print settings or network queue bodies.

Verification 2026-11-18: local Postgres test passes zero-new email, three-new preview/history, preview preserving noon membership, Rome winter/summer noon, daily idempotence and private-role denial. Three labeled TEST suggestions were submitted through the real endpoint; provider returned 200, the preview was confirmed, and Gmail receipt was read and checked for 3 new / 3 historical suggestions and the private inbox link. The three test suggestions remain new for the next scheduled noon. Actual scheduled noon delivery is still pending; preview delivery is verified.
