create schema wiki_analytics;
revoke all on schema wiki_analytics from public, anon, authenticated;
grant usage on schema wiki_analytics to anon;

create table wiki_analytics.daily_traffic (
  day date not null,
  section text not null,
  pageviews bigint not null,
  visits bigint not null,
  primary key (day, section)
);
alter table wiki_analytics.daily_traffic enable row level security;
revoke all on wiki_analytics.daily_traffic from public, anon, authenticated;

create function wiki_analytics.record_pageview(section_name text, new_visit boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('request.headers', true), '') = '' then return; end if;
  if (current_setting('request.headers', true)::jsonb ->> 'origin') is distinct from 'https://melvor2wiki.github.io'
     or section_name is null or section_name not in
        ('home','entry','category','search','family','experience','idle','money','pets','guides','guide','feedback')
  then return;
  end if;
  insert into wiki_analytics.daily_traffic as t (day,section,pageviews,visits)
  values ((now() at time zone 'Europe/Rome')::date, section_name, 1, case when new_visit then 1 else 0 end)
  on conflict (day,section) do update set pageviews=t.pageviews+1, visits=t.visits+excluded.visits;
end;
$$;
revoke all on function wiki_analytics.record_pageview(text,boolean) from public, anon, authenticated;
grant execute on function wiki_analytics.record_pageview(text,boolean) to anon;

create function public.record_wiki_pageview(section_name text, new_visit boolean)
returns void language sql security invoker set search_path = ''
as $$ select wiki_analytics.record_pageview(section_name,new_visit); $$;
revoke all on function public.record_wiki_pageview(text,boolean) from public, anon, authenticated;
grant execute on function public.record_wiki_pageview(text,boolean) to anon;
