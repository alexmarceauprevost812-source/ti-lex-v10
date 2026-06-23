-- Journal de toutes les injections de code (réussies ET refusées).
create table if not exists public.injection_audit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  path       text,
  message    text,
  pin_ok     boolean     not null default false,
  scope_ok   boolean     not null default false,
  success    boolean     not null default false,
  result     text,
  created_at timestamptz not null default now()
);
alter table public.injection_audit enable row level security;
-- Lecture réservée au propriétaire connecté. Écriture = service_role uniquement (Edge Function).
drop policy if exists "owner_reads_injection_audit" on public.injection_audit;
create policy "owner_reads_injection_audit"
  on public.injection_audit
  for select
  using (auth.uid() = user_id);
