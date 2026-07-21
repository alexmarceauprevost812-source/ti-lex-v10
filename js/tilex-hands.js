// js/tilex-hands.js
// ti-lex-AL v10 — Module "Les Mains"
// AGIR : redéployer Vercel + exécuter du SQL Supabase
// Auteur : Alex Marceau-Prévost
// Stack : Vanilla JS + Supabase + Vercel
//
// ⚠️ Tous les tokens restent CÔTÉ SERVEUR (api/). Jamais dans le client.
// 🔒 Les endpoints /api/ sont ADMIN-ONLY : on envoie la session Supabase de
//    l'admin en preuve, et le serveur revérifie (garde-fou client insuffisant).
//    exec_sql est verrouillée au service role — inatteignable depuis le browser.

const TilexHands = {
  endpointVercel: '/api/vercel-actions',
  endpointSupabase: '/api/supabase-actions',

  // Récupère le token de session Supabase (preuve qu'on est bien l'admin).
  async _token() {
    try {
      if (typeof window.getToken === 'function') {
        const t = window.getToken();
        if (t) return t;
      }
      if (window.supabase && window.SB_URL) {
        const c = window.__handsSb || (window.__handsSb = window.supabase.createClient(window.SB_URL, window.SB_ANON));
        const { data } = await c.auth.getSession();
        return data && data.session ? data.session.access_token : null;
      }
    } catch (_) {}
    return null;
  },

  async _post(endpoint, corps) {
    const t = await this._token();
    const headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(corps) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erreur || `HTTP ${res.status}`);
    return data;
  },

  // ─────────────────────────────────────────────
  // MAIN 1 : Redéclencher un déploiement Vercel
  // ─────────────────────────────────────────────
  async redeployer() {
    try {
      const data = await this._post(this.endpointVercel, { action: 'redeploy' });
      return `🚀 Redeploy lancé — ${data.url || 'en cours'}`;
    } catch (e) {
      console.error('[TilexHands] redeployer:', e);
      return `❌ Redeploy échoué : ${e.message}`;
    }
  },

  // ─────────────────────────────────────────────
  // MAIN 2 : Exécuter du SQL sur Supabase (create table, insert, etc.)
  // ─────────────────────────────────────────────
  async executerSQL(sql) {
    if (!sql || typeof sql !== 'string') {
      return '❌ SQL vide ou invalide';
    }
    // Garde-fou côté client (le serveur applique le même, de façon autoritaire) :
    // on bloque les trucs destructeurs sans confirmation explicite.
    const dangereux = /\b(drop\s+table|truncate|delete\s+from|drop\s+database)\b/i;
    if (dangereux.test(sql) && !sql.includes('-- CONFIRME')) {
      return '⚠️ Commande destructrice détectée. Ajoute "-- CONFIRME" à la fin du SQL pour forcer.';
    }

    try {
      const data = await this._post(this.endpointSupabase, { action: 'sql', query: sql });
      return `✅ SQL exécuté — ${data.rows ?? 0} ligne(s) affectée(s)`;
    } catch (e) {
      console.error('[TilexHands] executerSQL:', e);
      return `❌ SQL échoué : ${e.message}`;
    }
  },

  // ─────────────────────────────────────────────
  // MAIN 3 : Créer les tables manquantes du projet d'un coup
  // ─────────────────────────────────────────────
  async setupTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS tilex_memory (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_email TEXT NOT NULL,
        cle TEXT NOT NULL,
        valeur TEXT,
        contexte TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE tilex_memory ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS zip_historique (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nom_projet TEXT NOT NULL,
        fichiers JSONB,
        taille_ko NUMERIC,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE zip_historique ENABLE ROW LEVEL SECURITY;
    `;
    return this.executerSQL(sql);
  }
};

window.TilexHands = TilexHands;
