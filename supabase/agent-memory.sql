create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null check (char_length(agent_id) between 1 and 120),
  key text not null check (char_length(key) between 1 and 120),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists agent_memory_agent_created_idx
  on public.agent_memory (agent_id, created_at desc);

alter table public.agent_memory enable row level security;

-- Aucune politique publique : la table est accessible uniquement côté serveur
-- avec SUPABASE_SERVICE_ROLE_KEY. Ne jamais exposer cette clé au navigateur.
revoke all on table public.agent_memory from anon, authenticated;
