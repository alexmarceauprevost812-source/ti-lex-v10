-- Migration: conversation_management
-- Adds conversation management columns + conversation_projects table
-- Safe: uses IF NOT EXISTS patterns

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_msg_at timestamptz DEFAULT now();
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS preview text;

UPDATE public.conversations SET last_msg_at = COALESCE(updated_at, created_at) WHERE last_msg_at IS NULL;

CREATE TABLE IF NOT EXISTS public.conversation_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  color       text DEFAULT '#ff7f27',
  icon        text DEFAULT '📁',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS conv_project_id uuid REFERENCES public.conversation_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conv_user_lastmsg ON public.conversations(user_id, last_msg_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_fav ON public.conversations(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_conv_convproject ON public.conversations(conv_project_id) WHERE conv_project_id IS NOT NULL;

ALTER TABLE public.conversation_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_conv_projects" ON public.conversation_projects;
CREATE POLICY "own_conv_projects" ON public.conversation_projects
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
  SET
    message_count = message_count + 1,
    last_msg_at   = now(),
    updated_at    = now(),
    preview       = left(NEW.content, 120)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='messages') THEN
    DROP TRIGGER IF EXISTS trg_conv_msg ON public.messages;
    CREATE TRIGGER trg_conv_msg
      AFTER INSERT ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();
  END IF;
END;
$$;
