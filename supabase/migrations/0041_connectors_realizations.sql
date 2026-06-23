-- connector_status + realizations + exec_realize + messages.tool_calls
-- Applied to rnuripmfozlxenryxhdc

create table if not exists public.connector_status (
  id          text primary key,
  label       text not null,
  is_configured boolean not null default false,
  last_checked  timestamptz,
  last_status   text,
  updated_at  timestamptz not null default now()
);
alter table public.connector_status enable row level security;
drop policy if exists "connectors_read" on public.connector_status;
create policy "connectors_read" on public.connector_status
  for select to authenticated using (true);

insert into public.connector_status (id, label, is_configured) values
  ('supabase',  'Supabase',  true),
  ('github',    'GitHub',    false),
  ('anthropic', 'Anthropic', true),
  ('vercel',    'Vercel',    true)
on conflict (id) do nothing;

create table if not exists public.realizations (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  target      text,
  payload     text not null,
  status      text not null default 'pending',
  result      jsonb,
  created_at  timestamptz not null default now()
);
alter table public.realizations enable row level security;
drop policy if exists "realizations_own_read" on public.realizations;
create policy "realizations_own_read" on public.realizations
  for select to authenticated using (auth.uid() = user_id);

alter table public.messages add column if not exists tool_calls jsonb;

create or replace function public.exec_realize(p_sql text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin execute p_sql; return jsonb_build_object('ok', true); end; $$;
revoke all on function public.exec_realize(text) from public;
grant execute on function public.exec_realize(text) to service_role;
