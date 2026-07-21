-- « Les Mains » — execution SQL cote serveur.
-- SECURITE CRITIQUE : exec_sql tourne en SECURITY DEFINER (privileges eleves),
-- donc on la VERROUILLE au service role uniquement. anon/authenticated (la cle
-- publique du navigateur) ne peuvent PAS l'appeler -> aucun visiteur ne peut
-- executer de SQL. Seule une fonction serveur avec la cle service role y accede.
create or replace function public.exec_sql(sql_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows bigint;
begin
  execute sql_query;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;

create table if not exists public.tilex_hands_audit (
  id          bigint generated always as identity primary key,
  actor_email text,
  action      text not null,
  sql_query   text,
  ok          boolean,
  erreur      text,
  created_at  timestamptz not null default now()
);
alter table public.tilex_hands_audit enable row level security;
