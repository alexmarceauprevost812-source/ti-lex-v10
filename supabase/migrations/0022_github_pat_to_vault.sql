-- 0022: Migrate github_pat from plaintext to Supabase Vault
-- PREREQUISITE: deploy updated validate-github + github-proxy BEFORE running this.

-- Ensure Vault extension is enabled
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Helper: read PAT from Vault (service_role only)
CREATE OR REPLACE FUNCTION public.get_github_pat(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'github_pat_' || p_user_id::text
    LIMIT 1
  );
END;
$$;

-- Helper: store PAT in Vault (upsert)
CREATE OR REPLACE FUNCTION public.store_github_pat(p_user_id UUID, p_pat TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'github_pat_' || p_user_id::text;
  IF v_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_id, p_pat, 'github_pat_' || p_user_id::text, 'GitHub PAT chiffré');
  ELSE
    PERFORM vault.create_secret(p_pat, 'github_pat_' || p_user_id::text, 'GitHub PAT chiffré');
  END IF;
END;
$$;

-- Helper: delete PAT from Vault
CREATE OR REPLACE FUNCTION public.delete_github_pat(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'github_pat_' || p_user_id::text;
  IF v_id IS NOT NULL THEN
    PERFORM vault.delete_secret(v_id);
  END IF;
END;
$$;

-- Lock these to service_role only (Edge Functions)
REVOKE EXECUTE ON FUNCTION public.get_github_pat(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_github_pat(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_github_pat(UUID) FROM anon, authenticated;

-- Migrate existing PATs from profiles to Vault
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, github_pat
    FROM public.profiles
    WHERE github_pat IS NOT NULL AND github_pat != ''
  LOOP
    PERFORM public.store_github_pat(r.id, r.github_pat);
  END LOOP;
END $$;

-- Migrate any PATs from user_connections (if not already covered)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT uc.user_id, uc.github_pat
    FROM public.user_connections uc
    WHERE uc.github_pat IS NOT NULL AND uc.github_pat != ''
    AND NOT EXISTS (
      SELECT 1 FROM vault.secrets WHERE name = 'github_pat_' || uc.user_id::text
    )
  LOOP
    PERFORM public.store_github_pat(r.user_id, r.github_pat);
  END LOOP;
END $$;

-- Clear plaintext PATs
UPDATE public.profiles SET github_pat = NULL WHERE github_pat IS NOT NULL;
UPDATE public.user_connections SET github_pat = NULL WHERE github_pat IS NOT NULL;
