-- 10 questions gratuites, one-shot, offertes à l'inscription (compte gratuit).
-- Indépendant des quotas de plan payant (PLAN_LIMITS dans check-abonnement).
-- La valeur par défaut s'applique automatiquement aux nouveaux profils créés
-- par le déclencheur handle_new_user() lors de l'inscription.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_messages_remaining integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.profiles.bonus_messages_remaining IS
  'Questions gratuites uniques offertes à l''inscription (plan free) — décompte one-shot, ne se renouvelle jamais. 0 une fois épuisé.';
