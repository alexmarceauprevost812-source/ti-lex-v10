-- ============================================================================
-- ti-lex Security Agent — Migration initiale
-- Date: 2026-05-21
-- Projet Supabase: rnuripmfozlxenryxhdc
-- ============================================================================
-- Tables pour l'Agent de Sécurité Défensive ti-lex
-- Inclut : autorisations de scope (SOW), scans, findings, audit log immutable
-- ============================================================================

-- Activation des extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE: security_authorizations
-- Stocke les Statements of Work (SOW) signés. Chaque scan doit pointer vers une
-- autorisation active. Sans ça, l'agent refuse de tourner — c'est notre garde-fou
-- légal contre l'art. 342.1 du Code criminel.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_signatory_name TEXT NOT NULL,
    client_signatory_title TEXT NOT NULL,
    -- Allowlist des cibles autorisées (domaines, IP, URL)
    allowed_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Techniques autorisées
    allowed_techniques JSONB NOT NULL DEFAULT '["passive_recon", "vuln_scan", "web_scan"]'::jsonb,
    -- Techniques explicitement INTERDITES
    forbidden_techniques JSONB NOT NULL DEFAULT '["dos", "social_engineering", "destructive_exploit", "data_exfiltration"]'::jsonb,
    -- Fenêtre de validité
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    -- Hash cryptographique du SOW (texte intégral signé)
    sow_hash TEXT NOT NULL,
    sow_document_url TEXT,
    -- Statut
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'completed')),
    -- Kill switch
    killed_at TIMESTAMPTZ,
    killed_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sec_auth_user ON public.security_authorizations(user_id);
CREATE INDEX idx_sec_auth_status ON public.security_authorizations(status);
CREATE INDEX idx_sec_auth_validity ON public.security_authorizations(valid_from, valid_until);

-- ============================================================================
-- TABLE: security_scans
-- Chaque exécution de l'agent. Toujours liée à une autorisation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authorization_id UUID NOT NULL REFERENCES public.security_authorizations(id),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    scan_type TEXT NOT NULL CHECK (scan_type IN (
        'passive_recon',
        'vuln_scan',
        'web_scan',
        'dark_web_monitor',
        'config_audit',
        'full_audit'
    )),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'aborted'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    -- Résumé exécutif généré par Claude
    executive_summary TEXT,
    -- Statistiques
    findings_critical INT DEFAULT 0,
    findings_high INT DEFAULT 0,
    findings_medium INT DEFAULT 0,
    findings_low INT DEFAULT 0,
    findings_info INT DEFAULT 0,
    -- Erreur éventuelle
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scans_user ON public.security_scans(user_id);
CREATE INDEX idx_scans_auth ON public.security_scans(authorization_id);
CREATE INDEX idx_scans_status ON public.security_scans(status);

-- ============================================================================
-- TABLE: security_findings
-- Les vulnérabilités découvertes par l'agent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES public.security_scans(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_target TEXT NOT NULL,
    cve_ids TEXT[],
    cwe_ids TEXT[],
    -- Impact business + lien Loi 25 (généré par Claude)
    business_impact TEXT,
    loi25_relevance TEXT,
    -- Plan de remédiation
    remediation TEXT,
    remediation_effort TEXT CHECK (remediation_effort IN ('trivial', 'low', 'medium', 'high')),
    -- Statut chez le client
    client_status TEXT DEFAULT 'open' CHECK (client_status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix', 'false_positive')),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_findings_scan ON public.security_findings(scan_id);
CREATE INDEX idx_findings_severity ON public.security_findings(severity);
CREATE INDEX idx_findings_status ON public.security_findings(client_status);

-- ============================================================================
-- TABLE: security_audit_log
-- Audit log IMMUTABLE avec hash chain (style Merkle).
-- Chaque entrée référence le hash de l'entrée précédente. Toute altération
-- détectable. C'est notre preuve cryptographique en cas de litige.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id BIGSERIAL PRIMARY KEY,
    scan_id UUID REFERENCES public.security_scans(id),
    authorization_id UUID REFERENCES public.security_authorizations(id),
    user_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    -- Hash chain : SHA-256(previous_hash || current_event_data || timestamp)
    previous_hash TEXT,
    current_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_scan ON public.security_audit_log(scan_id);
CREATE INDEX idx_audit_event ON public.security_audit_log(event_type);
CREATE INDEX idx_audit_created ON public.security_audit_log(created_at);

-- Empêcher UPDATE et DELETE sur l'audit log (immutabilité au niveau BD)
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable. Operation % blocked.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON public.security_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON public.security_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();

-- ============================================================================
-- RLS (Row Level Security) — chaque utilisateur voit uniquement ses propres données
-- ============================================================================
ALTER TABLE public.security_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_authorizations" ON public.security_authorizations
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_scans" ON public.security_scans
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_findings" ON public.security_findings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.security_scans s
            WHERE s.id = security_findings.scan_id
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "users_own_audit_log" ON public.security_audit_log
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- FONCTION: vérification de scope avant exécution
-- Appelée par l'edge function avant tout scan. Retourne true si le scan
-- est autorisé, false sinon.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_scan_authorization(
    p_authorization_id UUID,
    p_target TEXT,
    p_scan_type TEXT
)
RETURNS TABLE(
    authorized BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_auth RECORD;
    v_target_match BOOLEAN := FALSE;
BEGIN
    SELECT * INTO v_auth
    FROM public.security_authorizations
    WHERE id = p_authorization_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Autorisation introuvable'::TEXT;
        RETURN;
    END IF;

    IF v_auth.status != 'active' THEN
        RETURN QUERY SELECT FALSE, ('Autorisation non active (statut: ' || v_auth.status || ')')::TEXT;
        RETURN;
    END IF;

    IF v_auth.killed_at IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, ('Kill switch activé: ' || COALESCE(v_auth.killed_reason, 'sans raison'))::TEXT;
        RETURN;
    END IF;

    IF NOW() < v_auth.valid_from THEN
        RETURN QUERY SELECT FALSE, 'Fenêtre de test pas encore commencée'::TEXT;
        RETURN;
    END IF;

    IF NOW() > v_auth.valid_until THEN
        RETURN QUERY SELECT FALSE, 'Fenêtre de test expirée'::TEXT;
        RETURN;
    END IF;

    -- Vérifier que la cible est dans l'allowlist
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_auth.allowed_targets) t
        WHERE p_target ILIKE '%' || t || '%'
    ) INTO v_target_match;

    IF NOT v_target_match THEN
        RETURN QUERY SELECT FALSE, ('Cible "' || p_target || '" hors scope autorisé')::TEXT;
        RETURN;
    END IF;

    -- Vérifier que la technique est autorisée
    IF NOT v_auth.allowed_techniques @> to_jsonb(p_scan_type) THEN
        RETURN QUERY SELECT FALSE, ('Technique "' || p_scan_type || '" non autorisée')::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Autorisé'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FONCTION: insertion sécurisée dans l'audit log (avec hash chain)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.append_audit_log(
    p_scan_id UUID,
    p_authorization_id UUID,
    p_user_id UUID,
    p_event_type TEXT,
    p_event_data JSONB
)
RETURNS BIGINT AS $$
DECLARE
    v_previous_hash TEXT;
    v_current_hash TEXT;
    v_id BIGINT;
BEGIN
    -- Récupérer le hash de la dernière entrée
    SELECT current_hash INTO v_previous_hash
    FROM public.security_audit_log
    ORDER BY id DESC
    LIMIT 1;

    v_previous_hash := COALESCE(v_previous_hash, 'GENESIS');

    -- Calculer le nouveau hash
    v_current_hash := encode(
        digest(
            v_previous_hash || p_event_type || p_event_data::TEXT || NOW()::TEXT,
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.security_audit_log (
        scan_id, authorization_id, user_id, event_type, event_data,
        previous_hash, current_hash
    ) VALUES (
        p_scan_id, p_authorization_id, p_user_id, p_event_type, p_event_data,
        v_previous_hash, v_current_hash
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================
COMMENT ON TABLE public.security_authorizations IS 'SOW signés par les clients. Garde-fou légal art. 342.1 C.cr.';
COMMENT ON TABLE public.security_scans IS 'Exécutions de l''agent défensif ti-lex.';
COMMENT ON TABLE public.security_findings IS 'Vulnérabilités découvertes, avec lien Loi 25.';
COMMENT ON TABLE public.security_audit_log IS 'Audit log immutable avec hash chain SHA-256.';
