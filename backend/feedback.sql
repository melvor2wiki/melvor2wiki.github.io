create schema if not exists feedback_private;
revoke all on schema feedback_private from public, anon, authenticated;
grant usage on schema feedback_private to service_role;

create table public.feedback_inbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page text not null check (char_length(page) between 1 and 200),
  page_url text not null check (char_length(page_url) <= 2200),
  suggestion text not null check (char_length(suggestion) between 10 and 4000),
  status text not null default 'new' check (status in ('new','reviewed','resolved','spam')),
  client_tag text not null check (client_tag ~ '^[0-9a-f]{64}$'),
  dedupe_tag text not null check (dedupe_tag ~ '^[0-9a-f]{64}$')
);
alter table public.feedback_inbox enable row level security;
revoke all on public.feedback_inbox from public, anon, authenticated;
grant select, insert, update on public.feedback_inbox to service_role;
create index feedback_time_idx on public.feedback_inbox (created_at desc);
create index feedback_client_time_idx on public.feedback_inbox (client_tag,created_at desc);
create index feedback_dedupe_idx on public.feedback_inbox (client_tag,dedupe_tag,created_at desc);

create table feedback_private.settings (
 id boolean primary key default true check(id),
 mail_enabled boolean not null default false,
 mail_endpoint text,
 inbox_url text not null default 'https://supabase.com/dashboard/project/ijmztvsjdzypvxnlicbf/editor'
);
insert into feedback_private.settings(id) values(true);
alter table feedback_private.settings enable row level security;
create table feedback_private.mail_attempts (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 delivered boolean
);
alter table feedback_private.mail_attempts enable row level security;
revoke all on all tables in schema feedback_private from public, anon, authenticated;
grant select,insert,update on all tables in schema feedback_private to service_role;

create function public.feedback_ingest(p_client text,p_dedupe text,p_page text,p_url text,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_client !~ '^[0-9a-f]{64}$' or p_dedupe !~ '^[0-9a-f]{64}$'
   or char_length(p_page) not between 1 and 200 or char_length(p_message) not between 10 and 4000
   or char_length(p_url)>2200 or p_url not like 'https://melvor2wiki.github.io/%'
 then return jsonb_build_object('accepted',false,'code','invalid'); end if;
 perform pg_catalog.pg_advisory_xact_lock(19371,707);
 if exists(select 1 from public.feedback_inbox where client_tag=p_client and dedupe_tag=p_dedupe and created_at>now()-interval '30 minutes')
 then return jsonb_build_object('accepted',true,'duplicate',true); end if;
 select count(*) into n from public.feedback_inbox where created_at>now()-interval '1 hour';
 if n>=100 then return jsonb_build_object('accepted',false,'code','rate_limited','retry_after',3600); end if;
 select count(*) into n from public.feedback_inbox where created_at>now()-interval '24 hours';
 if n>=500 then return jsonb_build_object('accepted',false,'code','rate_limited','retry_after',3600); end if;
 select count(*) into n from public.feedback_inbox where client_tag=p_client and created_at>now()-interval '10 minutes';
 if n>=5 then return jsonb_build_object('accepted',false,'code','rate_limited','retry_after',600); end if;
 select count(*) into n from public.feedback_inbox where client_tag=p_client and created_at>now()-interval '24 hours';
 if n>=20 then return jsonb_build_object('accepted',false,'code','rate_limited','retry_after',3600); end if;
 insert into public.feedback_inbox(client_tag,dedupe_tag,page,page_url,suggestion) values(p_client,p_dedupe,p_page,p_url,p_message);
 return jsonb_build_object('accepted',true,'duplicate',false);
end $$;
revoke all on function public.feedback_ingest(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.feedback_ingest(text,text,text,text,text) to service_role;

create function public.feedback_claim_notification()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg feedback_private.settings%rowtype; attempt uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(19371,708);
 select * into cfg from feedback_private.settings where id=true;
 if not cfg.mail_enabled or cfg.mail_endpoint is null then return null; end if;
 if exists(select 1 from feedback_private.mail_attempts where created_at>now()-interval '1 hour') then return null; end if;
 if (select count(*) from feedback_private.mail_attempts where created_at>now()-interval '24 hours')>=10 then return null; end if;
 insert into feedback_private.mail_attempts default values returning id into attempt;
 return jsonb_build_object('attempt',attempt,'endpoint',cfg.mail_endpoint,'inbox_url',cfg.inbox_url);
end $$;
revoke all on function public.feedback_claim_notification() from public,anon,authenticated;
grant execute on function public.feedback_claim_notification() to service_role;

create function public.feedback_record_notification(p_id uuid,p_delivered boolean)
returns void language sql security invoker set search_path='' as $$
 update feedback_private.mail_attempts set delivered=p_delivered where id=p_id;
$$;
revoke all on function public.feedback_record_notification(uuid,boolean) from public,anon,authenticated;
grant execute on function public.feedback_record_notification(uuid,boolean) to service_role;
