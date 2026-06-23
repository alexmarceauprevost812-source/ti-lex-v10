// js/tilex-memory.js
// Mémoire persistante Supabase cross-session pour ti-lex-AL v10

const TilexMemory = {

  async sauvegarder(role, contenu, sessionId) {
    if (!window.supabase) return false;
    const { error } = await window.supabase.from("tilex_memoire")
      .insert([{ role, contenu, session_id: sessionId, created_at: new Date().toISOString() }]);
    if (error) { console.error('[TilexMemory]', error.message); return false; }
    return true;
  },

  async charger(sessionId, limite = 50) {
    if (!window.supabase) return [];
    const { data, error } = await window.supabase.from("tilex_memoire")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(limite);
    return error ? [] : data;
  },

  async ajouterFait(cle, valeur, contexte) {
    if (!window.supabase) return false;
    const { error } = await window.supabase.from("tilex_faits")
      .upsert([{ cle, valeur, contexte, created_at: new Date().toISOString() }], { onConflict: "cle" });
    if (error) { console.error('[TilexMemory]', error.message); return false; }
    return true;
  },

  async chargerFaits() {
    if (!window.supabase) return [];
    const { data, error } = await window.supabase.from("tilex_faits")
      .select("*")
      .order("created_at", { ascending: false });
    return error ? [] : data;
  }
};

window.TilexMemory = TilexMemory;
