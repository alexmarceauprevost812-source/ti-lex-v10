-- Conversations et messages pour sauvegarde persistante
CREATE TABLE IF NOT EXISTS public.conversations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  titre        text DEFAULT 'Nouvelle conversation',
  archived     boolean DEFAULT false
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_conversations" ON public.conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text CHECK (role IN ('user','assistant')) NOT NULL,
  contenu         text NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_messages" ON public.messages
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);
