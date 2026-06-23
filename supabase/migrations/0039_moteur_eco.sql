-- ============================================================
-- ti-lex v10 — Moteur Économique Centre INDAR (crédits + forfaits)
-- Produit du Québec ⚜️
-- Migration 0039
-- ============================================================

-- 1. Ajouter credits_per_month à plan_limits
ALTER TABLE public.plan_limits
ADD COLUMN IF NOT EXISTS credits_per_month INTEGER DEFAULT 0;

COMMENT ON COLUMN public.plan_limits.credits_per_month IS
  'Crédits alloués par mois pour ce forfait. Rechargés le 1er du mois via cron ou webhook.';

UPDATE public.plan_limits SET credits_per_month = CASE plan
  WHEN 'free'            THEN 50
  WHEN 'ti'              THEN 500
  WHEN 'flux'            THEN 300
  WHEN 'surge'           THEN 2000
  WHEN 'apex'            THEN 5000
  WHEN 'cyber_shield'    THEN 1000
  WHEN 'cyber_recon'     THEN 3000
  WHEN 'cyber_guardian'  THEN 6000
  WHEN 'cyber_sentinel'  THEN 12000
  WHEN 'cyber_fortress'  THEN 25000
  ELSE 0
END;

-- 2. Table: action_costs — coût en crédits par type d'action
CREATE TABLE IF NOT EXISTS public.action_costs (
  action_type  TEXT PRIMARY KEY,
  credits_cost INTEGER NOT NULL DEFAULT 1 CHECK (credits_cost >= 0),
  description  TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.action_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_costs_read_all" ON public.action_costs
  FOR SELECT USING (true);

COMMENT ON TABLE public.action_costs IS
  'Coût en crédits par action. Lecture publique. Écriture admin/service_role uniquement.';

INSERT INTO public.action_costs (action_type, credits_cost, description) VALUES
  ('chat_message_sonnet',  1,  'Message chat — modèle Sonnet'),
  ('chat_message_opus',    5,  'Message chat — modèle Opus'),
  ('chat_message_haiku',   1,  'Message chat — modèle Haiku'),
  ('codex_session',        10, 'Session Codex (création/reprise)'),
  ('codex_commit',         5,  'Commit poussé via Codex'),
  ('image_generation',     3,  'Génération d''image IA'),
  ('cyber_scan',           20, 'Scan cybersécurité complet'),
  ('cyber_scan_quick',     5,  'Scan cybersécurité rapide'),
  ('thinking_1k_tokens',   2,  'Bloc de 1000 tokens thinking'),
  ('agent_creation',       5,  'Création d''un agent personnalisé'),
  ('file_analysis',        2,  'Analyse de fichier uploadé'),
  ('web_search',           1,  'Recherche web via agent')
ON CONFLICT (action_type) DO NOTHING;

-- 3. Table: user_credits — solde de crédits par utilisateur
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance         INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent  INTEGER NOT NULL DEFAULT 0,
  last_grant_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_credits_select_own" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_credits IS
  'Solde de crédits par utilisateur. SELECT own via RLS. Écritures via consume_credits/grant_credits (SECURITY DEFINER) uniquement. Aucune écriture directe client.';

-- 4. Table: credits_ledger — journal immuable de toutes les transactions
CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  tx_type       TEXT NOT NULL CHECK (tx_type IN (
    'plan_grant', 'purchase', 'consume', 'refund', 'bonus', 'admin_adjust', 'monthly_reset'
  )),
  action_type   TEXT,
  description   TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credits_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_ledger_select_own" ON public.credits_ledger
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credits_ledger_user_created
  ON public.credits_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credits_ledger_tx_type
  ON public.credits_ledger (tx_type, created_at DESC);

COMMENT ON TABLE public.credits_ledger IS
  'Journal immuable des transactions de crédits. Append-only. SELECT own via RLS. INSERT uniquement via SECURITY DEFINER. Ne jamais UPDATE/DELETE.';

-- 5. Table: usage_events — log des événements facturables
CREATE TABLE IF NOT EXISTS public.usage_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type      TEXT NOT NULL,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_events_select_own" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON public.usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_action_type
  ON public.usage_events (action_type, created_at DESC);

COMMENT ON TABLE public.usage_events IS
  'Log des événements facturables. metadata ne contient jamais de valeurs sensibles brutes. SELECT own via RLS. INSERT via SECURITY DEFINER.';
