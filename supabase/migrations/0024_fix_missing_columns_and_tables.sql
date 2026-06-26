-- Migration 0024: Fix missing columns and tables (Bug report June 19 2026)

-- Bug #1: Add archived column to conversations
alter table public.conversations
  add column if not exists archived boolean default false;

create index if not exists idx_conversations_user_archived
  on public.conversations(user_id, archived);

update public.conversations set archived = false where archived is null;

-- Bug #2: Add missing columns to profiles (deployed check-abonnement reads them)
alter table public.profiles
  add column if not exists message_count integer default 0,
  add column if not exists last_message_at timestamptz;

-- Bug #3: Create user_connections table
create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  github_connected boolean default false,
  github_username text,
  github_access_token text,
  slack_connected boolean default false,
  slack_workspace text,
  supabase_connected boolean default false,
  supabase_url text,
  supabase_anon_key text,
  supabase_project_id text,
  supabase_project_name text,
  supabase_connected_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

alter table public.user_connections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'user_connections' and policyname = 'Lire sa propre connexion') then
    create policy "Lire sa propre connexion" on public.user_connections for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_connections' and policyname = 'Modifier sa propre connexion') then
    create policy "Modifier sa propre connexion" on public.user_connections for all using (auth.uid() = user_id);
  end if;
end $$;

-- Bug #5: Create security RPCs and security_findings table
create or replace function public.verify_scan_authorization(
  p_authorization_id uuid,
  p_target text,
  p_scan_type text
)
returns table(authorized boolean, reason text)
language plpgsql security definer
as $$
begin
  if auth.uid() = 'd9a1985a-e106-4ea5-9ada-cac775c0b820'::uuid then
    return query select true, 'Administrateur autorisé'::text;
    return;
  end if;
  return query select false, 'Aucune autorisation de scan active'::text;
end;
$$;

create table if not exists public.security_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid,
  severity text not null,
  title text not null,
  description text,
  affected_target text,
  cve_ids text[] default '{}',
  cwe_ids text[] default '{}',
  business_impact text,
  loi25_relevance text,
  remediation text,
  remediation_effort text,
  status text default 'new',
  created_at timestamptz default now()
);

alter table public.security_findings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'security_findings' and policyname = 'Admin voit tout') then
    create policy "Admin voit tout" on public.security_findings for all
      using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
  end if;
end $$;
