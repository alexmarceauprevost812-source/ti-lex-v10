-- =============================================================
-- sql/zip_historique.sql
-- Table Supabase : historique des fichiers créés par ti-lex-AL v10
-- Projet : rnuripmfozlxenryxhdc
-- =============================================================

-- Supprime la table si elle existe déjà (pour re-déploiement propre)
DROP TABLE IF EXISTS zip_historique CASCADE;

-- ======================
-- Création de la table
-- ======================
CREATE TABLE zip_historique (
    -- Clé primaire UUID auto-générée
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nom du fichier créé (ex : app.js, schema.sql)
    nom_fichier   TEXT NOT NULL,

    -- Type / extension du fichier (html, css, js, json, md, py, sql)
    type_fichier  TEXT NOT NULL,

    -- Contenu complet du fichier généré
    contenu       TEXT,

    -- Timestamp de création (UTC)
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Référence à l'utilisateur Supabase Auth (optionnel si non connecté)
    user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ======================
-- Activation de RLS
-- ======================
ALTER TABLE zip_historique ENABLE ROW LEVEL SECURITY;

-- ======================
-- Politiques RLS
-- ======================

-- Politique 1 : Lecture — uniquement ses propres fichiers
CREATE POLICY "historique_lecture_propre" ON zip_historique
    FOR SELECT
    USING (auth.uid() = user_id);

-- Politique 2 : Insertion — utilisateur connecté seulement
CREATE POLICY "historique_insertion_propre" ON zip_historique
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Politique 3 : Suppression — uniquement ses propres fichiers
CREATE POLICY "historique_suppression_propre" ON zip_historique
    FOR DELETE
    USING (auth.uid() = user_id);

-- Note : Pas de UPDATE — les entrées d'historique sont immuables

-- ======================
-- Index pour performance
-- ======================

-- Index principal : date décroissante (requête par défaut)
CREATE INDEX idx_zip_historique_date
    ON zip_historique(date_creation DESC);

-- Index secondaire : recherche par utilisateur
CREATE INDEX idx_zip_historique_user
    ON zip_historique(user_id);

-- Index tertiaire : filtrage par type de fichier
CREATE INDEX idx_zip_historique_type
    ON zip_historique(type_fichier);

-- ======================
-- Commentaires de table
-- ======================
COMMENT ON TABLE zip_historique IS
    'Historique des fichiers créés par ti-lex-AL v10 via le générateur ZIP';

COMMENT ON COLUMN zip_historique.nom_fichier   IS 'Nom complet du fichier avec extension';
COMMENT ON COLUMN zip_historique.type_fichier  IS 'Extension : html | css | js | json | md | py | sql';
COMMENT ON COLUMN zip_historique.contenu       IS 'Contenu complet généré par ti-lex-AL v10';
COMMENT ON COLUMN zip_historique.date_creation IS 'Timestamp UTC de création';
COMMENT ON COLUMN zip_historique.user_id       IS 'UUID de l'utilisateur Supabase Auth';

-- ======================
-- Vue optionnelle : résumé sans le contenu (pour performances)
-- ======================
CREATE OR REPLACE VIEW v_zip_historique_resume AS
    SELECT
        id,
        nom_fichier,
        type_fichier,
        date_creation,
        user_id,
        length(contenu) AS taille_octets
    FROM zip_historique
    ORDER BY date_creation DESC;

-- ======================
-- Vérification finale
-- ======================
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'zip_historique'
    ) THEN
        RAISE NOTICE '[ti-lex] Table zip_historique créée avec succès ✓';
    ELSE
        RAISE EXCEPTION '[ti-lex] ERREUR : Table zip_historique non créée !';
    END IF;
END $$;
