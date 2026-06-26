-- Table compteur (fenêtre fixe). RLS activé, aucune policy = accès direct refusé.
-- Seules les fonctions SECURITY DEFINER / le service_role y touchent.
create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;

-- Vérifie ET incrémente de façon atomique. Retourne TRUE si autorisé, FALSE si dépassé.
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count integer;
begin
  insert into public.rate_limits(bucket, window_start, count)
  values (p_key, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Empêche l'appel direct par les rôles anon/authenticated
revoke all on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
