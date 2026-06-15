-- ============================================================
-- ti-lex v10 — Tables de consentement légal
-- Cadre juridique : Loi 25 (Québec) + LPRPDE + Code criminel
-- Produit du Québec ⚜️
-- ============================================================

-- 1. Vérifications NEQ (Registraire des entreprises du Québec)
CREATE TABLE IF NOT EXISTS public.enterprise_verifications (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  neq               VARCHAR(10) NOT NULL,
  company_name      TEXT,
  company_status    TEXT,       -- 'Actif', 'Inactif', 'Format valide'
  verification_ip   TEXT,       -- IP au moment de la vérification (preuve légale)
  verified_at       TIMESTAMPTZ DEFAULT NOW(),
  raw_response      JSONB,      -- Réponse brute du Registraire
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Signatures DPA (Déclaration de Propriété et d'Autorisation)
-- Conservées 5 ans — pièce maîtresse de la défense légale ti-lex
CREATE TABLE IF NOT EXISTS public.user_consents (
  id                            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enterprise_verification_id    UUID        REFERENCES public.enterprise_verifications(id),
  cgu_version                   VARCHAR(10) NOT NULL DEFAULT '1.0',
  dpa_declaration               TEXT        NOT NULL,    -- Texte exact signé
  declared_domains              TEXT[]      NOT NULL DEFAULT '{}',
  signed_at                     TIMESTAMPTZ DEFAULT NOW(),
  signing_ip                    TEXT,       -- IP de signature (preuve légale)
  user_agent                    TEXT,       -- Navigateur/appareil (preuve légale)
  is_active                     BOOLEAN     DEFAULT TRUE,
  created_at                    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Portée des scans autorisés (scope.json)
-- L'agent IA ne peut scanner QUE ces domaines
CREATE TABLE IF NOT EXISTS public.scan_scopes (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_id    UUID    NOT NULL REFERENCES public.user_consents(id) ON DELETE CASCADE,
  domain        TEXT    NOT NULL,
  domain_type   TEXT    DEFAULT 'url', -- 'url', 'ip', 'subnet'
  is_verified   BOOLEAN DEFAULT FALSE,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Logs d'audit (jamais supprimés — conservation 5 ans minimale)
-- Ces logs prouvent que ti-lex = fournisseur d'outil, pas attaquant
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    NOT NULL REFERENCES auth.users(id),
  event_type  TEXT    NOT NULL,  -- 'neq_verified', 'dpa_signed', 'scan_started', 'scan_completed'
  event_data  JSONB   NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS (Row Level Security) — chaque utilisateur voit seulement ses données
-- ============================================================

ALTER TABLE public.enterprise_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_scopes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                ENABLE ROW LEVEL SECURITY;

-- Politiques : lecture/écriture par le propriétaire seulement
CREATE POLICY "verif_owner_only"  ON public.enterprise_verifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "consent_owner_only" ON public.user_consents           FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "scope_owner_only"  ON public.scan_scopes              FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "audit_owner_only"  ON public.audit_logs               FOR SELECT USING (auth.uid() = user_id);

-- Les audit_logs ne peuvent être écrits QUE par le service role (Edge Functions)
-- Les utilisateurs peuvent les lire mais jamais les modifier

-- ============================================================
-- Index pour les performances
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_enterprise_verif_user ON public.enterprise_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_verif_neq  ON public.enterprise_verifications(neq);
CREATE INDEX IF NOT EXISTS idx_consents_user          ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_scopes_consent    ON public.scan_scopes(consent_id);
CREATE INDEX IF NOT EXISTS idx_audit_user             ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type       ON public.audit_logs(event_type);

-- ============================================================
-- Commentaires légaux sur les tables (documentation Loi 25)
-- ============================================================

COMMENT ON TABLE public.enterprise_verifications IS
  'Vérifications NEQ via Registraire QC. Preuve que ti-lex a validé l'identité légale du client avant tout scan. Conservation : 5 ans.';

COMMENT ON TABLE public.user_consents IS
  'Signatures électroniques DPA. Constitue une signature valide au sens de la LCCJTI (L.R.Q., c. C-1.1). Conservation : 5 ans minimum. Jamais supprimer ces enregistrements.';

COMMENT ON TABLE public.scan_scopes IS
  'Portée déclarée par le client. L'agent IA ne doit scanner QUE les domaines listés ici. Violation = incident de sécurité.';

COMMENT ON TABLE public.audit_logs IS
  'Logs immuables. Prouvent que ti-lex agit comme fournisseur d'outil uniquement. Conservation : 5 ans. Ne jamais purger.';
