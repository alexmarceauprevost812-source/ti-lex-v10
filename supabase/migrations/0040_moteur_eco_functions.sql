-- ============================================================
-- ti-lex v10 — Moteur Économique — Fonctions SECURITY DEFINER
-- Produit du Québec ⚜️
-- Migration 0040
-- ============================================================

-- 1. consume_credits — Débiter des crédits atomiquement
--    Retourne le solde restant ou -1 si insuffisant
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id    UUID,
  p_action     TEXT,
  p_amount     INTEGER DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost       INTEGER;
  v_balance    INTEGER;
  v_new_bal    INTEGER;
BEGIN
  IF p_amount IS NOT NULL THEN
    v_cost := p_amount;
  ELSE
    SELECT credits_cost INTO v_cost
    FROM action_costs
    WHERE action_type = p_action AND is_active = true;

    IF v_cost IS NULL THEN
      RAISE EXCEPTION 'Action inconnue ou désactivée: %', p_action;
    END IF;
  END IF;

  IF v_cost = 0 THEN
    INSERT INTO usage_events (user_id, action_type, credits_consumed, metadata)
    VALUES (p_user_id, p_action, 0, p_metadata);
    SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  SELECT balance INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance, lifetime_earned, lifetime_spent)
    VALUES (p_user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance := 0;
  END IF;

  IF v_balance < v_cost THEN
    RETURN -1;
  END IF;

  v_new_bal := v_balance - v_cost;

  UPDATE user_credits
  SET balance = v_new_bal,
      lifetime_spent = lifetime_spent + v_cost,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credits_ledger (user_id, amount, balance_after, tx_type, action_type, description, metadata)
  VALUES (p_user_id, -v_cost, v_new_bal, 'consume', p_action,
          'Consommation: ' || p_action, p_metadata);

  INSERT INTO usage_events (user_id, action_type, credits_consumed, metadata)
  VALUES (p_user_id, p_action, v_cost, p_metadata);

  RETURN v_new_bal;
END;
$$;

COMMENT ON FUNCTION public.consume_credits IS
  'Débiter des crédits. Retourne le nouveau solde, ou -1 si insuffisant. SECURITY DEFINER — appelé par Edge Functions.';

-- 2. grant_credits — Créditer des crédits
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_reason     TEXT DEFAULT 'plan_grant',
  p_metadata   JSONB DEFAULT '{}'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bal INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, balance, lifetime_earned, lifetime_spent, last_grant_at)
  VALUES (p_user_id, p_amount, p_amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount,
      lifetime_earned = user_credits.lifetime_earned + p_amount,
      last_grant_at = now(),
      updated_at = now();

  SELECT balance INTO v_new_bal FROM user_credits WHERE user_id = p_user_id;

  INSERT INTO credits_ledger (user_id, amount, balance_after, tx_type, description, metadata)
  VALUES (p_user_id, p_amount, v_new_bal, p_reason,
          'Crédits accordés: ' || p_reason || ' (+' || p_amount || ')', p_metadata);

  RETURN v_new_bal;
END;
$$;

COMMENT ON FUNCTION public.grant_credits IS
  'Ajouter des crédits. Raisons: plan_grant, purchase, bonus, refund, admin_adjust. SECURITY DEFINER.';

-- 3. get_my_credits — Lecture rapide du solde (RPC client-safe)
CREATE OR REPLACE FUNCTION public.get_my_credits()
RETURNS TABLE(balance INTEGER, lifetime_earned INTEGER, lifetime_spent INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT uc.balance, uc.lifetime_earned, uc.lifetime_spent
  FROM user_credits uc
  WHERE uc.user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, 0::INTEGER;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_my_credits IS
  'Retourne le solde de crédits de l''utilisateur connecté. Safe pour appel client.';

-- 4. get_action_cost — Coût d'une action (RPC client-safe)
CREATE OR REPLACE FUNCTION public.get_action_cost(p_action TEXT)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT credits_cost FROM action_costs WHERE action_type = p_action AND is_active = true),
    0
  );
$$;

COMMENT ON FUNCTION public.get_action_cost IS
  'Retourne le coût en crédits d''une action. 0 si inconnue ou désactivée.';

-- 5. monthly_credits_reset — Recharger les crédits mensuels
--    À appeler via pg_cron ou webhook Stripe le 1er du mois
CREATE OR REPLACE FUNCTION public.monthly_credits_reset()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec   RECORD;
BEGIN
  FOR v_rec IN
    SELECT p.id AS user_id, pl.credits_per_month
    FROM profiles p
    JOIN plan_limits pl ON pl.plan = p.plan
    WHERE pl.credits_per_month > 0
  LOOP
    UPDATE user_credits
    SET balance = v_rec.credits_per_month,
        updated_at = now(),
        last_grant_at = now()
    WHERE user_id = v_rec.user_id;

    IF NOT FOUND THEN
      INSERT INTO user_credits (user_id, balance, lifetime_earned, last_grant_at)
      VALUES (v_rec.user_id, v_rec.credits_per_month, v_rec.credits_per_month, now());
    END IF;

    INSERT INTO credits_ledger (user_id, amount, balance_after, tx_type, description)
    VALUES (v_rec.user_id, v_rec.credits_per_month, v_rec.credits_per_month,
            'monthly_reset', 'Recharge mensuelle — forfait ' || (SELECT plan FROM profiles WHERE id = v_rec.user_id));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.monthly_credits_reset IS
  'Recharge mensuelle des crédits pour tous les utilisateurs actifs. Appeler via cron le 1er du mois.';

-- 6. handle_new_user_billing — Trigger pour accorder les crédits initiaux
CREATE OR REPLACE FUNCTION public.handle_new_user_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_credits INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM profiles WHERE id = NEW.id;
  v_plan := COALESCE(v_plan, 'free');

  SELECT credits_per_month INTO v_credits FROM plan_limits WHERE plan = v_plan;
  v_credits := COALESCE(v_credits, 50);

  INSERT INTO user_credits (user_id, balance, lifetime_earned, last_grant_at)
  VALUES (NEW.id, v_credits, v_credits, now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO credits_ledger (user_id, amount, balance_after, tx_type, description)
  VALUES (NEW.id, v_credits, v_credits, 'bonus', 'Crédits de bienvenue — ' || v_plan);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_billing ON auth.users;
CREATE TRIGGER on_new_user_billing
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_billing();

COMMENT ON FUNCTION public.handle_new_user_billing IS
  'Trigger: accorde les crédits initiaux à chaque nouvel utilisateur selon son forfait.';

-- 7. Revoke direct writes from anon/authenticated on billing tables
REVOKE INSERT, UPDATE, DELETE ON public.user_credits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credits_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usage_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.action_costs FROM anon, authenticated;

-- 8. Grant initial credits to existing users
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT p.id AS user_id, COALESCE(pl.credits_per_month, 50) AS credits
    FROM profiles p
    LEFT JOIN plan_limits pl ON pl.plan = p.plan
    WHERE NOT EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = p.id)
  LOOP
    INSERT INTO user_credits (user_id, balance, lifetime_earned, last_grant_at)
    VALUES (v_rec.user_id, v_rec.credits, v_rec.credits, now())
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO credits_ledger (user_id, amount, balance_after, tx_type, description)
    VALUES (v_rec.user_id, v_rec.credits, v_rec.credits, 'bonus', 'Crédits initiaux — migration moteur économique');
  END LOOP;
END;
$$;
