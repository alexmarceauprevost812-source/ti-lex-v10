-- Codex Queue: communication Chat → Codex
CREATE TABLE IF NOT EXISTS public.codex_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  status       text DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','done','error')),
  titre        text NOT NULL,
  instruction  text NOT NULL,
  fichiers     jsonb DEFAULT '[]',
  resultat     text,
  log_erreur   text,
  traite_le    timestamptz
);

ALTER TABLE public.codex_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.codex_queue
  FOR ALL USING (auth.role() = 'service_role');
