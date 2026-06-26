CREATE TABLE IF NOT EXISTS public.user_connections (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  github_connected      boolean DEFAULT false,
  github_username       text,
  github_pat            text,
  github_avatar_url     text,
  github_connected_at   timestamptz,
  supabase_connected    boolean DEFAULT false,
  supabase_url          text,
  supabase_anon_key     text,
  supabase_project_id   text,
  supabase_project_name text,
  supabase_connected_at timestamptz,
  UNIQUE(user_id)
);

ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sees_own_connections" ON public.user_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_connections_user
  ON public.user_connections(user_id);
