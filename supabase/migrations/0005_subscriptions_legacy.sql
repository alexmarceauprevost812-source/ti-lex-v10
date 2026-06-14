-- 0005_subscriptions_legacy.sql
-- Table simplifiée pour suivre l'abonnement actif par utilisateur

CREATE TABLE IF NOT EXISTS subscriptions_legacy (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_customer_id   TEXT,
  plan                 TEXT NOT NULL DEFAULT 'free',
  status               TEXT NOT NULL DEFAULT 'inactive',
  price_id             TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at          TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions_legacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions_legacy FOR SELECT
  USING (auth.uid() = user_id);

-- Ajouter payment_status à profiles si absent
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'ok';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
