// ============================================================
// ti-lex-AL v10 — Noyau : Config étendue + Gardien anti-erreur
//                 + DB résiliente (retry + offline) + réseau
// Auteur: Alex Marceau-Prévost
// ⚠️ NE remplace PAS js/tilex-config.js (qui définit SB_URL/SB_ANON et
//    window.TILEX_CONFIG.supabaseUrl). Ce fichier ÉTEND la config existante
//    et doit être chargé APRÈS tilex-config.js.
// ============================================================

// ============================================================
// 1. CONFIG — étend window.TILEX_CONFIG (garde l'ancienne forme intacte)
// ============================================================
(function () {
  var SB_URL = window.SB_URL || "https://rnuripmfozlxenryxhdc.supabase.co";
  var SB_ANON = window.SB_ANON || "";
  window.TILEX_CONFIG = Object.assign({}, window.TILEX_CONFIG || {}, {
    // formes attendues par le système camion/forêt
    SUPABASE_URL: SB_URL,
    SUPABASE_KEY: SB_ANON,
    TRUCK_ID: "camion-alex",
    MAISON: { lat: 48.8290, lon: -72.5320 },
    TAUX: 40, TAUX_SUP: 60, SEUIL_SEMAINE: 40,
    ALERTE_ETA: 60,
    // on PRÉSERVE l'ancienne forme (lue par tilex-ia.js)
    supabaseUrl: (window.TILEX_CONFIG && window.TILEX_CONFIG.supabaseUrl) || SB_URL,
    supabaseKey: (window.TILEX_CONFIG && window.TILEX_CONFIG.supabaseKey) || SB_ANON
  });
})();

// ============================================================
// 2. GARDIEN ANTI-ERREUR — attrape les plantages (le système continue)
// ============================================================
const TilexGardien = {
  erreurs: [],
  init() {
    window.addEventListener("error", (e) => {
      this.logErreur("JS", e.message, (e.filename || "") + ":" + (e.lineno || ""));
    });
    window.addEventListener("unhandledrejection", (e) => {
      this.logErreur("Promise", (e.reason && e.reason.message) || String(e.reason || ""), "");
    });
    console.log("🛡️ Gardien ti-lex actif");
  },
  logErreur(type, message, source) {
    this.erreurs.push({ type, message, source, temps: new Date().toLocaleTimeString("fr-CA") });
    console.warn("⚠️ [" + type + "] " + message + " " + source);
    if (this.erreurs.length > 50) this.erreurs.shift();
  },
  async proteger(fonction, valeurDefaut = null) {
    try { return await fonction(); }
    catch (e) { this.logErreur("Protégé", e.message, ""); return valeurDefaut; }
  },
  voirErreurs() { return this.erreurs; }
};

// ============================================================
// 3. CLIENT SUPABASE PARTAGÉ — retry auto + sauvegarde offline
// ============================================================
const TilexDB = {
  client: null,
  async init() {
    if (this.client) return true;
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      this.client = createClient(window.TILEX_CONFIG.SUPABASE_URL, window.TILEX_CONFIG.SUPABASE_KEY);
      console.log("💾 Supabase connecté (TilexDB)");
      return true;
    } catch (e) { console.error("❌ Supabase: " + e.message); return false; }
  },
  async _assure() { if (!this.client) await this.init(); return !!this.client; },

  // INSERT avec retry auto (Starlink instable) → sinon sauvegarde locale
  async inserer(table, donnees, tentatives = 3) {
    if (!(await this._assure())) { this.sauverLocal(table, donnees); return { ok: false }; }
    for (let i = 0; i < tentatives; i++) {
      const { data, error } = await this.client.from(table).insert(donnees).select();
      if (!error) return { ok: true, data };
      console.warn(`⚠️ Insert ${table} ${i + 1}/${tentatives}: ${error.message}`);
      await this.attendre(1000 * (i + 1));
    }
    this.sauverLocal(table, donnees);
    return { ok: false };
  },

  // SELECT protégé (ne plante jamais → renvoie [] au pire)
  async lire(table, options = {}) {
    if (!(await this._assure())) return [];
    return TilexGardien.proteger(async () => {
      let q = this.client.from(table).select(options.select || "*");
      if (options.eq) q = q.eq(options.eq[0], options.eq[1]);
      if (options.order) q = q.order(options.order, { ascending: options.asc !== false });
      if (options.limit) q = q.limit(options.limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }, []);
  },

  sauverLocal(table, donnees) {
    try {
      const cle = "tilex_offline_" + table;
      const file = JSON.parse(localStorage.getItem(cle) || "[]");
      file.push({ donnees, temps: Date.now() });
      localStorage.setItem(cle, JSON.stringify(file));
      console.log("💾 Sauvé en local (offline): " + table);
    } catch (e) {}
  },

  async synchroniserOffline() {
    if (!(await this._assure())) return;
    const tables = ["truck_position", "agenda_jour", "voyage"];
    for (const table of tables) {
      const cle = "tilex_offline_" + table;
      let file;
      try { file = JSON.parse(localStorage.getItem(cle) || "[]"); } catch (e) { file = []; }
      if (!file.length) continue;
      let reussis = 0;
      for (const item of file) {
        const { error } = await this.client.from(table).insert(item.donnees);
        if (!error) reussis++;
      }
      if (reussis === file.length) {
        localStorage.removeItem(cle);
        console.log(`✅ ${reussis} données offline synchronisées (${table})`);
      }
    }
  },

  attendre(ms) { return new Promise(r => setTimeout(r, ms)); }
};

// ============================================================
// 4. RÉSEAU (online/offline) + sync auto au retour
// ============================================================
const TilexReseau = {
  init() {
    window.addEventListener("online", () => { console.log("🟢 Connexion revenue — sync…"); TilexDB.synchroniserOffline(); });
    window.addEventListener("offline", () => { console.log("🔴 Hors ligne — sauvegarde locale active"); });
  },
  estEnLigne() { return navigator.onLine; }
};

// ============================================================
// 5. DÉMARRAGE
// ============================================================
async function tilexDemarrer() {
  TilexGardien.init();
  TilexReseau.init();
  await TilexDB.init();
  if (navigator.onLine) await TilexDB.synchroniserOffline();
}

// Export global
if (typeof window !== "undefined") {
  window.TilexGardien = TilexGardien;
  window.TilexDB = TilexDB;
  window.TilexReseau = TilexReseau;
  window.tilexDemarrer = tilexDemarrer;
}
