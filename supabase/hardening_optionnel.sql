-- ============================================================================
-- hardening_optionnel.sql  —  À RÉVISER AVANT D'APPLIQUER. NON appliqué pour toi.
-- ============================================================================
-- Contexte : l'audit a trouvé 2 tables avec RLS activée mais ZÉRO policy :
--   - customers   (id uuid, stripe_customer_id text, created_at)
--   - user_roles  (user_id uuid, role text)
--
-- État actuel = « default deny » : sécuritaire (rien n'est lisible via la clé
-- publiable), mais ton front ne peut RIEN lire dans ces tables non plus.
--
-- N'APPLIQUE CE FICHIER QUE SI ton front-end a besoin de LIRE ces tables.
-- Si elles sont accédées seulement par tes Edge Functions (service_role, qui
-- contourne la RLS), NE FAIS RIEN : laisse-les verrouillées, c'est plus sûr.
--
-- ⚠️ RÈGLE CRITIQUE : on ajoute SEULEMENT des policies de LECTURE (SELECT).
--    On ne donne JAMAIS aux utilisateurs le droit d'écrire dans user_roles —
--    sinon n'importe qui pourrait se donner le rôle admin (escalade de privilège).
--    Les écritures dans customers et user_roles restent réservées au service_role.
-- ============================================================================

-- ---- customers : l'utilisateur peut lire SA propre ligne -------------------
-- (Hypothèse : customers.id correspond à l'id de l'utilisateur = auth.uid())
DROP POLICY IF EXISTS user_read_own_customer ON public.customers;
CREATE POLICY user_read_own_customer
  ON public.customers
  FOR SELECT
  USING (auth.uid() = id);

-- ---- user_roles : l'utilisateur peut lire SON propre rôle (LECTURE SEULE) --
DROP POLICY IF EXISTS user_read_own_role ON public.user_roles;
CREATE POLICY user_read_own_role
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE ici : volontaire. Les rôles se gèrent
-- côté serveur (service_role) uniquement.
