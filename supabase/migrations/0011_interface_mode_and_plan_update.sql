-- ============================================================
-- ti-lex v10 — Interface mode + plan constraint update
-- Produit du Québec ⚜️
-- ============================================================

-- 1. Ajouter le choix d'interface (animé / sérieux) sur profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS interface_mode TEXT DEFAULT 'animated'
CHECK (interface_mode IN ('animated', 'serious'));

-- 2. Mettre à jour la contrainte CHECK sur plan
-- Forfaits IA : free, flux ($19), surge ($60), apex ($125)
-- Forfaits Cyber : cyber_recon ($299), cyber_guardian ($599), cyber_sentinel ($1199)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
CHECK (plan IN ('free', 'flux', 'surge', 'apex', 'cyber_recon', 'cyber_guardian', 'cyber_sentinel'));

COMMENT ON COLUMN public.profiles.interface_mode IS
  'Choix d''interface utilisateur : animated (effets visuels) ou serious (sobre). Sauvegardé pour les prochaines connexions.';
