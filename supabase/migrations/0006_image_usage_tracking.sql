-- 0006_image_usage_tracking.sql
-- Tables et RPC pour le suivi d'utilisation des images

CREATE TABLE IF NOT EXISTS usage_daily (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  messages_sent   INT NOT NULL DEFAULT 0,
  images_generated INT NOT NULL DEFAULT 0,
  codex_sessions  INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS usage_monthly (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month           TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  messages_sent   INT NOT NULL DEFAULT 0,
  images_generated INT NOT NULL DEFAULT 0,
  codex_sessions  INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, month)
);

ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily usage"
  ON usage_daily FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own monthly usage"
  ON usage_monthly FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_image_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid UUID := auth.uid();
  today DATE := CURRENT_DATE;
  cur_month TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO usage_daily (user_id, date, images_generated)
  VALUES (uid, today, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET images_generated = usage_daily.images_generated + 1;

  INSERT INTO usage_monthly (user_id, month, images_generated)
  VALUES (uid, cur_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET images_generated = usage_monthly.images_generated + 1;
END;
$$;
