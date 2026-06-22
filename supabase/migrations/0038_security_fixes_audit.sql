-- =====================================================
-- 0038 — Corrections sécurité (audit Supabase officiel)
-- Centre INDAR · ti-lex v10 · rnuripmfozlxenryxhdc
-- =====================================================

-- 1. Document intentional RLS lockdown on service_role-only tables
COMMENT ON TABLE public.customers IS
  'Accès via service_role uniquement (Edge Functions). RLS activé sans policy = verrouillage volontaire côté client.';
COMMENT ON TABLE public.user_roles IS
  'Accès via service_role uniquement (Edge Functions). RLS activé sans policy = verrouillage volontaire côté client.';

-- 2. Replace permissive security_logs INSERT policy
DROP POLICY IF EXISTS "Service role can insert logs" ON public.security_logs;
CREATE POLICY "users_insert_own_logs"
  ON public.security_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Revoke anon EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.append_audit_log(uuid, uuid, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_total_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_feed(text, text, text, integer, integer) FROM anon;
ALTER FUNCTION public.append_audit_log(uuid, uuid, uuid, text, jsonb) SET search_path = public, pg_temp;

-- 4. Remove wide listing policy on ti-lex-studio bucket
DROP POLICY IF EXISTS "ti_lex_studio_read" ON storage.objects;
