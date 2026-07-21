// ============================================
// js/tilex-guardian.js
// TilexGuardian — Gardien anti-erreur ti-lex-AL v10
// Garde ti-lex-code 100% en fonction, toujours
// Auteur: Alex Marceau-Prévost
// ============================================

const TilexGuardian = {
  config: {
    maxRetries: 3,
    retryDelay: 1500,
    heartbeatInterval: 10000, // check toutes les 10s
    debug: true
  },

  state: {
    erreurs: [],
    redemarrages: 0,
    enVie: true,
    dernierHeartbeat: Date.now()
  },

  // ---------- DÉMARRAGE ----------
  init() {
    this.log('🛡️ TilexGuardian activé — surveillance 24/7');
    this.attraperErreursGlobales();
    this.lancerHeartbeat();
    this.surveillerConnexion();
    return this;
  },

  // Erreurs BÉNIGNES connues : bruit normal du navigateur qui ne casse rien
  // (image/script qui charge pas, fetch annulé en changeant de page, script
  // tiers comme Puter, ResizeObserver…). On les ignore SILENCIEUSEMENT — pas de
  // toast alarmant, pas de fausse « auto-réparation ».
  estBenigne(message) {
    if (!message) return true; // erreur de chargement de ressource (img/script) : pas un crash
    const m = String(message);
    return /resizeobserver|script error|load failed|failed to fetch|networkerror|the user aborted|aborterror|non-error promise rejection|the operation was aborted|load cancelled|the play\(\) request|play\(\) request was interrupted/i.test(m);
  },

  // ---------- 1. ATTRAPE TOUTES LES ERREURS ----------
  attraperErreursGlobales() {
    // Erreurs JS classiques
    window.addEventListener('error', (e) => {
      // Erreur de CHARGEMENT d'une ressource (img/script/vidéo) : e.target est
      // l'élément, pas window. Ça ne casse pas l'app — on ignore complètement.
      if (e.target && e.target !== window) return;
      this.gererErreur('JS', e.message, e.filename, e.lineno);
      e.preventDefault();
      return true; // empêche le crash
    }, true);

    // Promesses rejetées (async/await, fetch...)
    window.addEventListener('unhandledrejection', (e) => {
      this.gererErreur('PROMISE', e.reason?.message || e.reason);
      e.preventDefault();
    });
  },

  // ---------- 2. GESTION D'ERREUR + AUTO-RÉPARATION ----------
  gererErreur(type, message, fichier = '', ligne = '') {
    // Bruit inoffensif → on ignore complètement (pas de toast, pas de repair).
    if (this.estBenigne(message)) return;

    const erreur = {
      type,
      message,
      fichier,
      ligne,
      timestamp: new Date().toISOString()
    };
    this.state.erreurs.push(erreur);
    this.log(`⚠️ Erreur ${type} attrapée: ${message}`, 'warn');

    // Plus de toast alarmant pour l'utilisateur : le gardien protège en
    // arrière-plan (log console + auto-réparation), sans crier « erreur » à
    // chaque petit hoquet. On ne notifie QUE si ça se répète vraiment beaucoup
    // (≥ 12 erreurs réelles rapprochées = quelque chose ne va pas pour de vrai).
    if (window.TilexToast && this.state.erreurs.length > 0 && this.state.erreurs.length % 12 === 0) {
      TilexToast.show(`🛡️ ti-lex a corrigé quelques accrocs — tout roule`, 'info');
    }

    // Tentative d'auto-réparation
    this.autoReparer(erreur);
  },

  // ---------- 3. AUTO-RÉPARATION ----------
  autoReparer(erreur) {
    // Erreur Supabase → reconnexion
    if (/supabase|fetch|network/i.test(erreur.message)) {
      this.log('🔧 Tentative reconnexion Supabase...', 'info');
      this.reconnecterSupabase();
    }

    // Erreur streaming mobile → reset le stream
    if (/stream|typewriter/i.test(erreur.message)) {
      this.log('🔧 Reset du streaming...', 'info');
      if (window.TilexStream) window.TilexStream.reset?.();
    }
  },

  // ---------- 4. HEARTBEAT (pouls du système) ----------
  lancerHeartbeat() {
    setInterval(() => {
      this.state.dernierHeartbeat = Date.now();

      // Vérifie que les modules critiques sont vivants
      const modules = {
        stream: !!window.TilexStream,
        toast: !!window.TilexToast,
        supabase: !!window.supabaseClient
      };

      const morts = Object.entries(modules)
        .filter(([_, vivant]) => !vivant)
        .map(([nom]) => nom);

      if (morts.length > 0) {
        this.log(`💔 Modules manquants: ${morts.join(', ')}`, 'warn');
      } else {
        this.log('💚 Tous les systèmes en fonction');
      }
    }, this.config.heartbeatInterval);
  },

  // ---------- 5. SURVEILLANCE CONNEXION ----------
  surveillerConnexion() {
    window.addEventListener('online', () => {
      this.log('🌐 Connexion rétablie');
      if (window.TilexToast) TilexToast.show('🌐 De retour en ligne', 'success');
      this.reconnecterSupabase();
    });

    window.addEventListener('offline', () => {
      this.log('📴 Mode offline — cache local actif', 'warn');
      if (window.TilexToast) TilexToast.show('📴 Mode offline activé', 'info');
    });
  },

  // ---------- 6. RECONNEXION SUPABASE ----------
  async reconnecterSupabase(tentative = 1) {
    if (tentative > this.config.maxRetries) {
      this.log('❌ Supabase injoignable après 3 essais', 'error');
      return false;
    }

    try {
      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('tilex_memory')
          .select('id')
          .limit(1);

        if (!error) {
          this.log('✅ Supabase reconnecté');
          return true;
        }
      }
      throw new Error('Pas de client Supabase');
    } catch (e) {
      this.log(`🔄 Retry Supabase ${tentative}/${this.config.maxRetries}...`, 'warn');
      await new Promise(r => setTimeout(r, this.config.retryDelay));
      return this.reconnecterSupabase(tentative + 1);
    }
  },

  // ---------- 7. WRAPPER SÉCURISÉ (protège n'importe quelle fonction) ----------
  protéger(fn, nom = 'fonction') {
    return (...args) => {
      try {
        const resultat = fn(...args);
        // Si c'est une promesse, on attrape aussi
        if (resultat instanceof Promise) {
          return resultat.catch(err => {
            this.gererErreur('ASYNC', `${nom}: ${err.message}`);
          });
        }
        return resultat;
      } catch (err) {
        this.gererErreur('WRAP', `${nom}: ${err.message}`);
      }
    };
  },

  // ---------- 8. RAPPORT DE SANTÉ ----------
  rapport() {
    return {
      enVie: this.state.enVie,
      totalErreurs: this.state.erreurs.length,
      redemarrages: this.state.redemarrages,
      dernieresErreurs: this.state.erreurs.slice(-5),
      uptime: Date.now() - this.state.dernierHeartbeat
    };
  },

  // ---------- UTILS ----------
  log(msg, niveau = 'info') {
    if (!this.config.debug) return;
    const styles = {
      info: 'color:#4ade80',
      warn: 'color:#fbbf24',
      error: 'color:#f87171'
    };
    console.log(`%c[TilexGuardian] ${msg}`, styles[niveau] || styles.info);
  }
};

// ---------- AUTO-DÉMARRAGE ----------
if (typeof window !== 'undefined') {
  window.TilexGuardian = TilexGuardian;
  document.addEventListener('DOMContentLoaded', () => TilexGuardian.init());
}
