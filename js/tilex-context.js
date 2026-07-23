// ============================================
// tilex-context.js — Contexte conversation actif
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Garde le contexte vivant entre les messages
// Chargé en <script> classique → exposé sur window.TilexContext
// ============================================

const TilexContext = {

  // ── STATE INTERNE ─────────────────────────
  _historique: [],       // messages de la session
  _maxMessages: 20,      // max messages gardés en mémoire
  _systeme: '',          // prompt système injecté
  _memoire: '',          // contexte mémoire Supabase injecté
  _projet: 'ti-lex-AL v10',

  // modèle par défaut (aligné sur l'app : Sonnet 4.6 ; surchargeable via window.TILEX_DEFAULT_MODEL)
  _defaultModel: (typeof window !== 'undefined' && window.TILEX_DEFAULT_MODEL) || 'claude-sonnet-5',

  // ── INIT ──────────────────────────────────
  init(promptSysteme = '') {
    this._historique = [];
    this._systeme = promptSysteme;
    console.log('[TilexContext] ✅ Contexte initialisé');
  },

  // ── INJECTER LA MÉMOIRE SUPABASE ──────────
  setMemoire(texteMemoire) {
    this._memoire = texteMemoire || '';
    console.log('[TilexContext] 🧠 Mémoire injectée dans le contexte');
  },

  // ── SYNCHRONISER LA MÉMOIRE DEPUIS TilexMemory ──
  async syncMemoire(limite = 10) {
    if (window.TilexMemory && typeof window.TilexMemory.toPromptContext === 'function') {
      try { this.setMemoire(await window.TilexMemory.toPromptContext(limite)); } catch (e) {}
    }
    return this._memoire;
  },

  // ── AJOUTER UN MESSAGE ────────────────────
  ajouterMessage(role, contenu) {
    // role = 'user' | 'assistant' | 'system'
    this._historique.push({ role, content: contenu });
    // Garde seulement les N derniers messages
    if (this._historique.length > this._maxMessages) {
      this._historique = this._historique.slice(-this._maxMessages);
    }
  },

  // ── CONSTRUIRE LE PAYLOAD COMPLET ─────────
  buildPayload(messageUtilisateur, modelId) {
    const systemeFinal = [this._systeme, this._memoire].filter(Boolean).join('\n\n');
    this.ajouterMessage('user', messageUtilisateur);
    return {
      model: modelId || this._defaultModel,
      max_tokens: 2048,
      system: systemeFinal,
      messages: [...this._historique]
    };
  },

  // ── ENREGISTRER LA RÉPONSE IA ─────────────
  enregistrerReponse(reponse) {
    this.ajouterMessage('assistant', reponse);
    console.log('[TilexContext] 💬 Réponse IA enregistrée dans le contexte');
  },

  // ── VOIR L'HISTORIQUE ─────────────────────
  getHistorique() { return [...this._historique]; },

  // ── COMPTER LES MESSAGES ──────────────────
  count() { return this._historique.length; },

  // ── RÉSUMÉ RAPIDE ─────────────────────────
  resume() {
    return {
      projet: this._projet,
      messages: this._historique.length,
      maxMessages: this._maxMessages,
      memoireActive: !!this._memoire,
      systemeActif: !!this._systeme
    };
  },

  // ── RESET SESSION ─────────────────────────
  reset() {
    this._historique = [];
    this._memoire = '';
    console.log('[TilexContext] 🔄 Contexte resetté');
  }

};

window.TilexContext = TilexContext;
