-- 0051_yilo_memory.sql — Ajout user_id + RLS à la table yilo_memory existante

ALTER TABLE public.yilo_memory
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.yilo_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'yilo_memory' AND policyname = 'yilo_memory_select_own') THEN
    CREATE POLICY "yilo_memory_select_own" ON public.yilo_memory FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'yilo_memory' AND policyname = 'yilo_memory_insert_own') THEN
    CREATE POLICY "yilo_memory_insert_own" ON public.yilo_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'yilo_memory' AND policyname = 'yilo_memory_update_own') THEN
    CREATE POLICY "yilo_memory_update_own" ON public.yilo_memory FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'yilo_memory' AND policyname = 'yilo_memory_delete_own') THEN
    CREATE POLICY "yilo_memory_delete_own" ON public.yilo_memory FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_yilo_memory_user ON public.yilo_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_yilo_memory_type ON public.yilo_memory(user_id, type);
