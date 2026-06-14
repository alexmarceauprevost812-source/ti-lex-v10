-- Cyber Dashboard tables for the cybersecurity agent
-- Migration: 0008_cyber_dashboard_tables.sql

create table if not exists public.cyber_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_name text not null,
  contact_name text,
  contact_email text,
  domain text,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cyber_mandates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_id uuid references public.cyber_companies(id) on delete cascade,
  mandate_number text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','completed','expired','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_employees_to_scan int default 0,
  scanned_count int default 0,
  scope_in text[] default '{}',
  scope_out text[] default '{}',
  allowed_scan_types text[] default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cyber_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mandate_id uuid references public.cyber_mandates(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'info' check (severity in ('critical','high','medium','low','info')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved','false_positive')),
  source text,
  source_name text,
  remediation text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cyber_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mandate_id uuid references public.cyber_mandates(id) on delete set null,
  scan_type text not null default 'passive_recon',
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  results jsonb default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.cyber_formation_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_id uuid references public.cyber_companies(id) on delete cascade,
  employee_name text,
  module_name text not null,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','failed')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.cyber_companies enable row level security;
alter table public.cyber_mandates enable row level security;
alter table public.cyber_findings enable row level security;
alter table public.cyber_scans enable row level security;
alter table public.cyber_formation_assignments enable row level security;

create policy "Users manage own cyber_companies" on public.cyber_companies for all using (auth.uid() = user_id);
create policy "Users manage own cyber_mandates" on public.cyber_mandates for all using (auth.uid() = user_id);
create policy "Users manage own cyber_findings" on public.cyber_findings for all using (auth.uid() = user_id);
create policy "Users manage own cyber_scans" on public.cyber_scans for all using (auth.uid() = user_id);
create policy "Users manage own cyber_formation_assignments" on public.cyber_formation_assignments for all using (auth.uid() = user_id);

create index if not exists idx_cyber_findings_severity on public.cyber_findings(severity, status);
create index if not exists idx_cyber_mandates_status on public.cyber_mandates(status);
create index if not exists idx_cyber_scans_created on public.cyber_scans(created_at);
