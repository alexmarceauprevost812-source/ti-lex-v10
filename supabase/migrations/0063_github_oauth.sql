-- 0063_github_oauth.sql
-- Connexion GitHub par OAuth (GitHub App) au lieu d'un PAT collé à la main.
--
-- Pourquoi deux NOUVELLES tables au lieu de rallonger user_connections :
--   la RLS de user_connections laisse l'usager faire « select * » sur sa propre
--   ligne — donc le navigateur (et n'importe quel XSS) peut lire
--   github_access_token en clair. Les jetons OAuth, eux, atterrissent dans une
--   table SANS aucune politique : seul le service_role (les edge functions) y
--   touche. Le navigateur voit jamais un jeton, point.

-- ── Le « state » anti-CSRF : à usage unique, courte vie ──
create table if not exists public.github_oauth_states (
  state       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  redirect_to text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '10 minutes')
);
alter table public.github_oauth_states enable row level security;
-- Aucune policy volontairement : le service_role contourne la RLS, tout le
-- reste (anon, authenticated) est barré au complet.

create index if not exists idx_github_oauth_states_expire
  on public.github_oauth_states(expires_at);

-- ── Les jetons ──
create table if not exists public.github_oauth_tokens (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  access_token       text not null,
  refresh_token      text,
  -- Les jetons user-to-server d'une GitHub App durent 8 h, le refresh 6 mois.
  expires_at         timestamptz,
  refresh_expires_at timestamptz,
  scope              text,
  github_login       text,
  github_user_id     bigint,
  installation_id    bigint,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.github_oauth_tokens enable row level security;
-- Idem : aucune policy.

comment on table public.github_oauth_tokens is
  'Jetons GitHub OAuth par usager. Lisible uniquement par le service_role — jamais par le client.';

-- Supabase donne SELECT/INSERT/UPDATE/DELETE à anon+authenticated par défaut
-- sur toute nouvelle table du schéma public. La RLS sans policy bloque déjà
-- tout, mais on enlève le grant pareil : comme ça, même une policy ajoutée par
-- erreur plus tard peut pas ouvrir la porte.
revoke all on public.github_oauth_states from anon, authenticated;
revoke all on public.github_oauth_tokens from anon, authenticated;
