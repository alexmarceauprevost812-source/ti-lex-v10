// ============================================
// tilex-memory.js — Mémoire cross-session
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Supabase persistance mémoire longue durée — PAR UTILISATEUR (RLS)
// Chargé en <script> classique → exposé sur window.TilexMemory
// ============================================

const TilexMemory = {

  supabase: null,
  table: 'tilex_memory',

  // ── INIT ──────────────────────────────────
  init(supabaseClient) {
    this.supabase = supabaseClient || window.supabase || null;
    if (this.supabase) console.log('[TilexMemory] ✅ Mémoire initialisée');
    return this;
  },

  _sb() { return this.supabase || window.supabase || null; },

  async _uid() {
    const sb = this._sb(); if (!sb) return null;
    try { const r = await sb.auth.getUser(); return (r && r.data && r.data.user && r.data.user.id) || null; }
    catch (e) { return null; }
  },

  // ── SAUVEGARDER UN SOUVENIR ───────────────
  async save(type, contenu, score = 1) {
    const sb = this._sb();
    if (!sb) { console.warn('[TilexMemory] ⚠️ Supabase non initialisé'); return null; }
    const uid = await this._uid();
    if (!uid) { console.warn('[TilexMemory] ⚠️ Non connecté — souvenir non sauvegardé'); return null; }

    const { data, error } = await sb
      .from(this.table)
      .insert([{
        user_id: uid,
        type,        // ex: 'fact', 'preference', 'projet', 'conversation'
        contenu,     // texte du souvenir
        score,       // importance (1 = normal, 5 = critique)
        validated_by: 'ti-lex',
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) { console.error('[TilexMemory] ❌ Erreur save:', error.message); return null; }
    console.log('[TilexMemory] 💾 Souvenir sauvegardé:', type);
    return data;
  },

  // ── CHARGER LES SOUVENIRS ─────────────────
  async load(type = null, limite = 20) {
    const sb = this._sb(); if (!sb) return [];
    const uid = await this._uid(); if (!uid) return [];

    let query = sb
      .from(this.table)
      .select('*')
      .eq('user_id', uid)
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limite);

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) { console.error('[TilexMemory] ❌ Erreur load:', error.message); return []; }
    console.log(`[TilexMemory] 📦 ${data.length} souvenirs chargés`);
    return data;
  },

  // ── CHERCHER DANS LA MÉMOIRE ──────────────
  async search(motCle) {
    const sb = this._sb(); if (!sb) return [];
    const uid = await this._uid(); if (!uid) return [];

    const { data, error } = await sb
      .from(this.table)
      .select('*')
      .eq('user_id', uid)
      .ilike('contenu', `%${motCle}%`)
      .order('score', { ascending: false })
      .limit(10);

    if (error) { console.error('[TilexMemory] ❌ Erreur search:', error.message); return []; }
    return data;
  },

  // ── METTRE À JOUR LE SCORE ────────────────
  async updateScore(id, nouveauScore) {
    const sb = this._sb(); if (!sb) return;
    // RLS garantit qu'on ne modifie que ses propres souvenirs
    const { error } = await sb.from(this.table).update({ score: nouveauScore }).eq('id', id);
    if (error) console.error('[TilexMemory] ❌ Erreur updateScore:', error.message);
    else console.log(`[TilexMemory] 🔼 Score mis à jour → ${nouveauScore}`);
  },

  // ── SUPPRIMER UN SOUVENIR ─────────────────
  async delete(id) {
    const sb = this._sb(); if (!sb) return;
    const { error } = await sb.from(this.table).delete().eq('id', id);
    if (error) console.error('[TilexMemory] ❌ Erreur delete:', error.message);
    else console.log('[TilexMemory] 🗑️ Souvenir supprimé');
  },

  // ── VIDER LA MÉMOIRE (de l'utilisateur courant) ──
  async clear() {
    const sb = this._sb(); if (!sb) return;
    const uid = await this._uid(); if (!uid) return;
    const { error } = await sb.from(this.table).delete().eq('user_id', uid);
    if (error) console.error('[TilexMemory] ❌ Erreur clear:', error.message);
    else console.log('[TilexMemory] 🧹 Mémoire vidée (utilisateur courant)');
  },

  // ── RÉSUMÉ MÉMOIRE POUR LE PROMPT ─────────
  async toPromptContext(limite = 10) {
    const souvenirs = await this.load(null, limite);
    if (!souvenirs.length) return '';
    const lignes = souvenirs.map(s => `[${(s.type || '').toUpperCase()}] ${s.contenu}`);
    return `\n\n--- MÉMOIRE TI-LEX ---\n${lignes.join('\n')}\n--- FIN MÉMOIRE ---\n`;
  }

};

// ── TABLE SUPABASE (créée — schéma par utilisateur + RLS) ────
// create table public.tilex_memory (
//   id BIGSERIAL PRIMARY KEY,
//   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   type TEXT NOT NULL,
//   contenu TEXT NOT NULL,
//   score INTEGER NOT NULL DEFAULT 1,
//   validated_by TEXT DEFAULT 'ti-lex',
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );  -- RLS : chaque utilisateur ne voit/modifie que ses souvenirs

window.TilexMemory = TilexMemory;
document.addEventListener('DOMContentLoaded', () => {
  if (window.supabase && !TilexMemory.supabase) TilexMemory.init(window.supabase);
});
