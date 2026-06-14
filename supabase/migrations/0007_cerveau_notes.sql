-- Deuxième Cerveau: notes table with RLS
CREATE TABLE IF NOT EXISTS public.cerveau_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  summary text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cerveau_notes_user ON public.cerveau_notes(user_id);
CREATE INDEX idx_cerveau_notes_tags ON public.cerveau_notes USING gin(tags);

ALTER TABLE public.cerveau_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notes"
  ON public.cerveau_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notes"
  ON public.cerveau_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notes"
  ON public.cerveau_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notes"
  ON public.cerveau_notes FOR DELETE
  USING (auth.uid() = user_id);
