-- Daily summary and private preview. Run as postgres after updating the intake.
-- Existing feedback.sql must already be installed. No email endpoint/key is embedded.
-- Enable pg_cron via the Dashboard first if the server requires preload configuration.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
revoke all on all tables in schema net from public,anon,authenticated,service_role;
revoke execute on all functions in schema net from public,anon,authenticated,service_role;

create table if not exists feedback_private.digest_runs (
 id uuid primary key default gen_random_uuid(),
 local_day date not null,
 is_test boolean not null default false,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 state text not null check(state in ('empty','pending','confirmed','failed','ambiguous')),
 request_id bigint,
 item_count bigint not null default 0,
 excerpt_count integer not null default 0,
 page_count bigint not null default 0,
 page_lines integer not null default 0,
 response_status integer
);
create table if not exists feedback_private.digest_items (
 run_id uuid not null references feedback_private.digest_runs(id),
 -- Deliberately no FK to inbox: deleting a reviewed row must not break audit history.
 feedback_id uuid not null,
 primary key(run_id,feedback_id)
);
alter table feedback_private.digest_runs add column if not exists is_test boolean not null default false;
alter table feedback_private.digest_runs drop constraint if exists digest_runs_local_day_key;
create unique index if not exists digest_runs_daily_unique on feedback_private.digest_runs(local_day) where not is_test;
create index if not exists digest_items_feedback_idx on feedback_private.digest_items(feedback_id);
alter table feedback_private.digest_runs enable row level security;
alter table feedback_private.digest_items enable row level security;
revoke all on feedback_private.digest_runs,feedback_private.digest_items from public,anon,authenticated;
grant select on feedback_private.digest_runs,feedback_private.digest_items to service_role;

-- The installed intake from feedback.sql can no longer reserve immediate mail,
-- even if an old Edge instance briefly remains alive during rollout.
create or replace function public.feedback_claim_notification()
returns jsonb language sql security invoker set search_path='' as $$ select null::jsonb $$;
revoke all on function public.feedback_claim_notification() from public,anon,authenticated;

-- Used by the internal cron owner only; no exposed RPC / security definer.
create or replace function feedback_private.digest_reconcile()
returns void language plpgsql security invoker set search_path='' as $$
declare attempt record; response record; payload jsonb; next_state text;
begin
 perform pg_catalog.pg_advisory_xact_lock(19371,709);
 for attempt in select * from feedback_private.digest_runs where state='pending' for update loop
  select * into response from net._http_response where id=attempt.request_id limit 1;
  if found then
   payload:=null;
   begin payload:=response.content::jsonb; exception when others then payload:=null; end;
   -- Provider acknowledgment means accepted by provider, not proven Gmail delivery.
   if response.status_code between 200 and 299
      and coalesce(response.timed_out,false)=false and response.error_msg is null
      and payload->>'success'='true' then next_state:='confirmed';
   elsif coalesce(response.timed_out,false) or response.error_msg is not null
      or response.status_code is null or response.status_code between 200 and 299
      or response.status_code>=500 then next_state:='ambiguous';
   else next_state:='failed'; end if;
   update feedback_private.digest_runs set state=next_state,completed_at=now(),response_status=response.status_code where id=attempt.id;
  elsif attempt.created_at<now()-interval '10 minutes' then
   -- Never retry an unknown outcome. pg_net queues/responses are unlogged and can
   -- disappear on crash; acknowledgment cannot then be reconstructed safely.
   delete from net.http_request_queue where id=attempt.request_id;
   update feedback_private.digest_runs set state='ambiguous',completed_at=now() where id=attempt.id;
  end if;
 end loop;
end $$;

create or replace function feedback_private.digest_dispatch(p_test boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare
 local_time timestamp:=now() at time zone 'Europe/Rome';
 cfg feedback_private.settings%rowtype;
 run uuid; total bigint; pages bigint; page_rows integer:=0; shown integer:=0;
 row_data record; summary text:=''; excerpts text:=''; line text; body jsonb;
 req bigint; counted bigint:=0; historical bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(19371,709);
 perform feedback_private.digest_reconcile();
 -- Cron wakes hourly UTC. Rome noon is 11:00 UTC winter / 10:00 UTC summer.
 if not p_test and extract(hour from local_time)<>12 then return; end if;
 if p_test and exists(select 1 from feedback_private.digest_runs where is_test and created_at>now()-interval '1 hour') then return; end if;
 if not p_test and exists(select 1 from feedback_private.digest_runs where local_day=local_time::date and not is_test) then return; end if;
 if exists(select 1 from feedback_private.digest_runs where state='pending') then return; end if;
 select * into cfg from feedback_private.settings where id=true;
 if not found or not cfg.mail_enabled or cfg.mail_endpoint is null then return; end if;
 -- Match only the current provider's Ajax HTTPS endpoint; never turn settings
 -- into an arbitrary network proxy. Owner must explicitly review provider changes.
 if cfg.mail_endpoint !~ '^https://formsubmit[.]co/ajax/[A-Za-z0-9@._%+~-]+$' then
  raise exception 'Digest requires the approved HTTPS FormSubmit Ajax endpoint';
 end if;
 if cfg.inbox_url not like 'https://supabase.com/dashboard/project/%' or octet_length(cfg.inbox_url)>2200 then
  raise exception 'Digest requires a private Supabase inbox link';
 end if;
 insert into feedback_private.digest_runs(local_day,state,is_test) values(local_time::date,'pending',p_test) returning id into run;
 -- Membership is the watermark: include ALL persisted rows not in any confirmed
 -- digest, regardless of status/time. A concurrent insert missed by this snapshot
 -- remains eligible tomorrow, even if its created_at predates this transaction.
 insert into feedback_private.digest_items(run_id,feedback_id)
 select run,f.id from public.feedback_inbox f where not exists(
  select 1 from feedback_private.digest_items i join feedback_private.digest_runs r on r.id=i.run_id
  where i.feedback_id=f.id and r.state='confirmed' and not r.is_test
 );
 select count(*) into total from feedback_private.digest_items where run_id=run;
 select count(*) into historical from public.feedback_inbox;
 select count(distinct f.page) into pages from public.feedback_inbox f
 join feedback_private.digest_items i on i.feedback_id=f.id where i.run_id=run;
 -- Bounded byte budgets (UTF-8 + JSON escaping) protect provider payload size.
 -- First provide per-page counts; extreme backlog gets explicit aggregate overflow.
 for row_data in
  select f.page,count(*) n from public.feedback_inbox f join feedback_private.digest_items i on i.feedback_id=f.id
  where i.run_id=run group by f.page order by f.page
 loop
  line:=left(regexp_replace(row_data.page,'[[:cntrl:]]',' ','g'),80)||': '||row_data.n||E'\n';
  if octet_length(to_jsonb(summary||line)::text)>18000 then exit; end if;
  summary:=summary||line; page_rows:=page_rows+1; counted:=counted+row_data.n;
 end loop;
 if page_rows<pages then summary:=summary||format(E'Other pages: %s; suggestions on those pages: %s. Full page list in private inbox.\n',pages-page_rows,total-counted); end if;
 for row_data in
  select f.* from public.feedback_inbox f join feedback_private.digest_items i on i.feedback_id=f.id
  where i.run_id=run order by f.created_at,f.id
 loop
  line:=format(E'[%s Europe/Rome] %s\n%s\n\n',
   to_char(row_data.created_at at time zone 'Europe/Rome','YYYY-MM-DD HH24:MI'),
   left(regexp_replace(row_data.page,'[[:cntrl:]]',' ','g'),100),
   left(regexp_replace(row_data.suggestion,'[[:cntrl:]]',' ','g'),240)||case when char_length(row_data.suggestion)>240 then ' [excerpt]' else '' end);
  if shown>=100 or octet_length(to_jsonb(excerpts||line)::text)>24000 then exit; end if;
  excerpts:=excerpts||line; shown:=shown+1;
 end loop;
 body:=jsonb_build_object(
  '_subject',format('[Melvor 2 Wiki]%s %s new suggestions - %s',case when p_test then ' [TEST]' else '' end,total,local_time::date),
  '_captcha','false','_template','table','_url','https://melvor2wiki.github.io/',
  'new_suggestions',total,'all_suggestions_received',historical,
  'summary',format('%s new suggestions. %s suggestions in your complete history. %s excerpts shown; %s without an individual excerpt. Open View all suggestions for full original messages. New means not included in an earlier confirmed daily summary.%s',total,historical,shown,total-shown,case when p_test then ' This is a preview: messages remain new for the next scheduled daily email.' else '' end),
  'per_page_counts',summary,'suggestion_excerpts',excerpts,'view_all_suggestions',cfg.inbox_url
 );
 if octet_length(body::text)>48000 then raise exception 'Digest payload exceeds 48000 bytes'; end if;
 req:=net.http_post(url:=cfg.mail_endpoint,body:=body,
  headers:=jsonb_build_object('Content-Type','application/json','Accept','application/json','Referer','https://melvor2wiki.github.io/'),
  timeout_milliseconds:=7000);
 update feedback_private.digest_runs set request_id=req,item_count=total,excerpt_count=shown,page_count=pages,page_lines=page_rows where id=run;
 -- HTTP runs only after commit: no externally sent email can survive a rollback
 -- of its day claim. Do not implement retries on ambiguous or failed states.
end $$;

create or replace function feedback_private.digest_send_due()
returns void language sql security invoker set search_path='' as $$ select feedback_private.digest_dispatch(false) $$;

revoke all on function feedback_private.digest_reconcile(),feedback_private.digest_send_due(),feedback_private.digest_dispatch(boolean) from public,anon,authenticated,service_role;
-- Jobs execute as this SQL's owner (postgres); no secret in cron.job.
select cron.schedule('feedback-daily-noon-rome','0 * * * *','select feedback_private.digest_send_due();');
select cron.schedule('feedback-digest-reconcile','* * * * *','select feedback_private.digest_reconcile();');
commit;
