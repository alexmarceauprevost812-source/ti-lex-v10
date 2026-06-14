-- =====================================================================
--  ti-lex Security Agent — Schéma corrigé et consolidé
--  Corrige : terminateur de fonction commenté, gel des termes du mandat,
--  scellage garanti du hash, normalisation des cibles, durcissements.
-- =====================================================================

-- 1. Table des mandats (SOW) / logs d'audit -------------------------------
CREATE TABLE IF NOT EXISTS public.security_authorizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_signatory_name TEXT NOT NULL,
    client_signatory_title TEXT NOT NULL,
    allowed_targets JSONB NOT NULL,       -- ex: ["cible.com"]
    allowed_techniques JSONB NOT NULL,    -- ex: ["web_scan"]
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    sow_hash TEXT NOT NULL,               -- placeholder à l'insert -> SHA-256 final scellé
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_auth_dates
    ON public.security_authorizations (valid_from, valid_until);

-- 2. Garde-fou RPC : cible dans le scope + mandat actif -------------------
--    Normalise les deux côtés (schéma, port, chemin, casse) avant comparaison.
CREATE OR REPLACE FUNCTION public.verify_scan_authorization(
    auth_id UUID,
    requested_target TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    normalized_target TEXT;
    is_valid BOOLEAN;
BEGIN
    -- Retire schéma -> retire chemin -> retire port -> minuscules
    normalized_target := split_part(
        split_part(lower(regexp_replace(coalesce(requested_target, ''), '^[a-z]+://', '')), '/', 1),
        ':', 1
    );

    SELECT EXISTS (
        SELECT 1
        FROM public.security_authorizations sa
        WHERE sa.id = auth_id
          AND NOW() BETWEEN sa.valid_from AND sa.valid_until
          AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(sa.allowed_targets) AS t(val)
              WHERE split_part(
                        split_part(lower(regexp_replace(t.val, '^[a-z]+://', '')), '/', 1),
                        ':', 1
                    ) = normalized_target
          )
    ) INTO is_valid;

    RETURN COALESCE(is_valid, FALSE);
END;
$$;

-- 3. Immuabilité : gèle les termes + scelle le hash une seule fois --------
CREATE OR REPLACE FUNCTION public.enforce_sow_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    placeholder_prefix CONSTANT TEXT := 'initial_client_side_hash_';
    is_final_hash CONSTANT BOOLEAN := COALESCE(NEW.sow_hash ~ '^[0-9a-f]{64}$', FALSE);
BEGIN
    -- a) Termes du mandat : strictement gelés (sur TOUT update)
    IF NEW.user_id                is DISTINCT FROM OLD.user_id
       OR NEW.client_name         is DISTINCT FROM OLD.client_name
       OR NEW.client_email        is DISTINCT FROM OLD.client_email
       OR NEW.client_signatory_name  is DISTINCT FROM OLD.client_signatory_name
       OR NEW.client_signatory_title is DISTINCT FROM OLD.client_signatory_title
       OR NEW.allowed_targets     is DISTINCT FROM OLD.allowed_targets
       OR NEW.allowed_techniques  is DISTINCT FROM OLD.allowed_techniques
       OR NEW.valid_from          is DISTINCT FROM OLD.valid_from
       OR NEW.valid_until         is DISTINCT FROM OLD.valid_until
       OR NEW.created_at          is DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'SOW immuable : les termes du mandat ne peuvent pas etre modifies (autorisation %).', OLD.id
            USING errcode = 'check_violation';
    END IF;

    -- b) sow_hash : finalisable une seule fois (placeholder/NULL -> 64 hex)
    IF NEW.sow_hash is DISTINCT FROM OLD.sow_hash THEN
        IF (OLD.sow_hash IS NULL OR OLD.sow_hash LIKE placeholder_prefix || '%')
           AND is_final_hash
        THEN
            NULL; -- transition légitime
        ELSE
            RAISE EXCEPTION 'SOW immuable : le hash d''audit est deja scelle ou invalide (autorisation %).', OLD.id
                USING errcode = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Empêche la suppression d'un mandat scellé ---------------------------
CREATE OR REPLACE FUNCTION public.prevent_sealed_sow_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(OLD.sow_hash ~ '^[0-9a-f]{64}$', FALSE) THEN
        RAISE EXCEPTION 'SOW immuable : un mandat scelle ne peut pas etre supprime (autorisation %).', OLD.id
            USING errcode = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

-- 5. Liaison des triggers (on supprime aussi l'ancien nom pour éviter les doublons)
DROP TRIGGER IF EXISTS tr_secure_audit_immutability ON public.security_authorizations;
DROP TRIGGER IF EXISTS trg_enforce_sow_immutability ON public.security_authorizations;
DROP TRIGGER IF EXISTS trg_prevent_sealed_sow_delete ON public.security_authorizations;

CREATE TRIGGER trg_enforce_sow_immutability
    BEFORE UPDATE ON public.security_authorizations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_sow_immutability();

CREATE TRIGGER trg_prevent_sealed_sow_delete
    BEFORE DELETE ON public.security_authorizations
    FOR EACH ROW EXECUTE FUNCTION public.prevent_sealed_sow_delete();

-- =====================================================================
-- 6. RLS — RECOMMANDÉ, à activer une fois Supabase Auth branché sur la page
-- =====================================================================
ALTER TABLE public.security_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_own_sow"
    ON public.security_authorizations
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "select_own_sow"
    ON public.security_authorizations
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
