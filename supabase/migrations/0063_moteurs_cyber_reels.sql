-- ============================================================================
-- 0063_moteurs_cyber_reels.sql
-- Moteurs de cybersécurité RÉELS (bibliothèque _shared/moteurs-cyber.ts)
--   1. Colonnes de traçabilité sur cyber_scans / cyber_findings
--   2. RPC de posture interne (RLS, policies, buckets, fonctions, comptes)
--      → utilisées par les moteurs « posture » qui inspectent la base
--      elle-même plutôt que le réseau.
-- Idempotent : peut être rejouée sans danger.
-- ============================================================================

-- ─── 1. Traçabilité des scans réels ────────────────────────────────────────
alter table public.cyber_scans
  add column if not exists mode text default 'simulation',
  add column if not exists moteurs text[] default '{}',
  add column if not exists moteurs_ok text[] default '{}',
  add column if not exists moteurs_echec text[] default '{}',
  add column if not exists engine_version text;

comment on column public.cyber_scans.mode is
  'reel = vérifications réseau/base réelles · simulation = rapport généré par IA';
comment on column public.cyber_scans.moteurs is
  'Identifiants des moteurs demandés (voir _shared/moteurs-cyber.ts)';

alter table public.cyber_findings
  add column if not exists moteur text,
  add column if not exists preuve jsonb default '{}'::jsonb,
  add column if not exists cwe_ids text[] default '{}';

comment on column public.cyber_findings.preuve is
  'Donnée brute observée (en-tête, réponse DNS, statut HTTP) — trace vérifiable du constat';

-- SILEX écrit ses constats dans security_findings : même traçabilité.
alter table public.security_findings
  add column if not exists moteur text,
  add column if not exists preuve jsonb default '{}'::jsonb;

comment on column public.security_findings.moteur is
  'Identifiant du moteur qui a produit le constat (voir _shared/moteurs-cyber.ts)';

create index if not exists idx_security_findings_moteur
  on public.security_findings(moteur);

create index if not exists idx_cyber_scans_user_mode
  on public.cyber_scans(user_id, mode);
create index if not exists idx_cyber_findings_moteur
  on public.cyber_findings(moteur);

-- ─── 2. RPC posture interne ────────────────────────────────────────────────
-- Toutes en security definer, réservées au service_role : elles lisent le
-- catalogue système, jamais des données utilisateur.

-- 2.1 RLS + nombre de policies par table du schéma public
create or replace function public.silex_rls_summary()
returns table(table_name text, rls_enabled boolean, nb_policies integer)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    (select count(*)::integer from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
  order by c.relname;
$$;

-- 2.2 Buckets de stockage publics
create or replace function public.silex_buckets_stockage()
returns table(bucket_id text, est_public boolean, cree_le timestamptz)
language sql
security definer
set search_path = pg_catalog, storage, public
as $$
  select b.id::text, b.public, b.created_at
  from storage.buckets b
  order by b.id;
$$;

-- 2.3 Fonctions du schéma public exécutables par anon / authenticated
create or replace function public.silex_fonctions_exposees()
returns table(nom text, anon_execute boolean, authenticated_execute boolean, est_definer boolean)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    p.proname::text,
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  order by p.proname;
$$;

-- 2.4 Portrait des comptes d'authentification (agrégats uniquement)
create or replace function public.silex_comptes_auth()
returns table(
  total integer,
  courriels_non_confirmes integer,
  sans_mfa integer,
  dormants_90j integer,
  admins integer
)
language sql
security definer
set search_path = pg_catalog, auth, public
as $$
  select
    (select count(*)::integer from auth.users),
    (select count(*)::integer from auth.users where email_confirmed_at is null),
    (select count(*)::integer from auth.users u
       where not exists (
         select 1 from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified'
       )),
    (select count(*)::integer from auth.users
       where last_sign_in_at is not null
         and last_sign_in_at < now() - interval '90 days'),
    (select count(*)::integer from public.user_roles where role = 'admin');
$$;

-- 2.5 Extensions installées dans le schéma public (mauvaise pratique Supabase)
create or replace function public.silex_extensions_publiques()
returns table(nom text, schema_nom text, version text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select e.extname::text, n.nspname::text, e.extversion::text
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  order by e.extname;
$$;

-- 2.6 Fraîcheur de la journalisation d'audit
create or replace function public.silex_journalisation()
returns table(evenements_7j integer, dernier_evenement timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if to_regclass('public.audit_events') is null then
    return query select 0, null::timestamptz;
    return;
  end if;
  return query execute
    'select count(*)::integer, max(created_at) from public.audit_events
       where created_at >= now() - interval ''7 days''';
end;
$$;

-- ─── 3. Verrouillage des privilèges ────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.silex_rls_summary()',
    'public.silex_buckets_stockage()',
    'public.silex_fonctions_exposees()',
    'public.silex_comptes_auth()',
    'public.silex_extensions_publiques()',
    'public.silex_journalisation()'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
