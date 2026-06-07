-- =============================================================================
-- ti-lex-v10 — Correctifs sécurité & système is_admin() (VERSION APPLIQUÉE)
-- Projet Supabase : rnuripmfozlxenryxhdc
-- Appliqué le : 2026-06-07
--
-- Reflète EXACTEMENT ce qui a été poussé en prod, via deux migrations :
--   1) security_fixes_and_is_admin
--   2) lock_is_admin_from_anon
--
-- Vérifié après application :
--   - scans_detailed ............ security_invoker = on   ✅
--   - 3 triggers updated_at ..... search_path figé        ✅
--   - idx_security_auth_user .... supprimé (doublon)       ✅
--   - is_admin() ................ exécutable: authenticated ✅ (anon révoqué)
--   - profiles.admin_full_access. câblée sur is_admin()    ✅
-- =============================================================================


-- ============================================================
-- MIGRATION 1 : security_fixes_and_is_admin
-- ============================================================

-- 1. Vue scans_detailed : forcer security_invoker (corrige l'ERREUR advisor).
--    En invoker, la vue applique le RLS de l'utilisateur qui interroge.
ALTER VIEW public.scans_detailed SET (security_invoker = on);

-- 2. Fonctions trigger : figer le search_path.
--    Sûr ici : elles ne touchent que NEW.updated_at (now()/timezone() sont
--    dans pg_catalog, toujours résolus même avec search_path vide).
ALTER FUNCTION public.tg_set_updated_at()                  SET search_path = '';
ALTER FUNCTION public.scans_set_updated_at()               SET search_path = '';
ALTER FUNCTION public.scan_authorizations_set_updated_at() SET search_path = '';

-- 3. Index dupliqué sur security_authorizations (on garde idx_sec_auth_user).
DROP INDEX IF EXISTS public.idx_security_auth_user;

-- 4. Fonction is_admin() : check de rôle en SECURITY DEFINER pour contourner
--    le RLS de user_roles (sinon la sous-requête voit 0 ligne et aucun admin
--    n'est jamais reconnu). search_path figé => tout est schema-qualifié.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 5. Recâbler profiles.admin_full_access sur is_admin().
--    (SELECT public.is_admin()) => évalué une fois par requête (perf).
--    Scope TO authenticated : anon ne peut jamais être admin.
DROP POLICY IF EXISTS admin_full_access ON public.profiles;

CREATE POLICY admin_full_access ON public.profiles
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));


-- ============================================================
-- MIGRATION 2 : lock_is_admin_from_anon
-- ============================================================
-- Les default privileges Supabase exposent automatiquement les fonctions
-- du schéma public au rôle anon comme RPC. is_admin() n'a aucune raison
-- d'être appelable par un visiteur non connecté.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;


-- =============================================================================
-- COMMENT DÉSIGNER UN ADMIN (rappel)
-- =============================================================================
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<uuid-du-user>', 'admin')
--   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
--
-- À partir de là, is_admin() renvoie true pour ce user et la policy
-- admin_full_access lui donne l'accès complet à profiles. Réutilise
-- (SELECT public.is_admin()) dans toute future policy admin.
-- =============================================================================
-- RESTE À TRAITER (hors SQL / décisions produit)
-- =============================================================================
--   - Auth > Settings : activer "Leaked password protection" (HaveIBeenPwned).
--   - Auth : stratégie de connexions DB -> "percentage" avant de scaler l'instance.
--   - get_marketplace_feed / get_total_users : OK si publics, sinon REVOKE anon.
--   - Index "inutilisés" (~70) : ne pas toucher tant qu'il n'y a pas de trafic.
--   - Dette : DROP SCHEMA archive (ancien crypto) + consolider le billing
--     (subscriptions_legacy vs customers/products/prices/subscriptions).
-- =============================================================================
