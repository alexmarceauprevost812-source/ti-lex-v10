// TILEX-OFFLINE.JS — Gestionnaire Mode Offline
// Ti-lex-AL v10 — Auteur: Alex Marceau-Prévost

var TilexOffline = {

  estEnLigne: navigator.onLine,
  swActif: false,

  async init() {
    await this.enregistrerSW();
    this.ecouterConnexion();
    this.mettreAJourUI();
  },

  async enregistrerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      var registration = await navigator.serviceWorker.register('/sw.js');
      this.swActif = true;
      registration.addEventListener('updatefound', function() {
        TilexOffline.afficherNotifMiseAJour(registration);
      });
    } catch (err) {
      console.error('[TilexOffline] erreur SW:', err);
    }
  },

  ecouterConnexion() {
    var self = this;
    window.addEventListener('online', function() {
      self.estEnLigne = true;
      self.mettreAJourUI();
      self.afficherToast('Connexion retablie!', 'succes');
      setTimeout(function(){ self.viderQueue(); }, 1000);
    });
    window.addEventListener('offline', function() {
      self.estEnLigne = false;
      self.mettreAJourUI();
      self.afficherToast('Mode offline active — Ti-lex continue!', 'avertissement');
    });
  },

  mettreAJourUI: function() {
    var indicateur = document.getElementById('tilex-statut-connexion');
    var banniere = document.getElementById('tilex-banniere-offline');
    if (indicateur) {
      indicateur.className = this.estEnLigne ? 'tilex-statut en-ligne' : 'tilex-statut hors-ligne';
      indicateur.title = this.estEnLigne ? 'En ligne' : 'Mode offline';
    }
    if (banniere) {
      banniere.style.display = this.estEnLigne ? 'none' : 'flex';
    }
    document.body.classList.toggle('tilex-offline', !this.estEnLigne);
  },

  sauvegarderLocal: function(cle, donnees) {
    try {
      localStorage.setItem('tilex_' + cle, JSON.stringify({ donnees: donnees, timestamp: Date.now() }));
      return true;
    } catch (err) { return false; }
  },

  lireLocal: function(cle) {
    try {
      var raw = localStorage.getItem('tilex_' + cle);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) { return null; }
  },

  ajouterQueue: function(action) {
    var queue = this.lireLocal('queue') || { donnees: [] };
    action.timestamp = Date.now();
    queue.donnees.push(action);
    this.sauvegarderLocal('queue', queue.donnees);
  },

  viderQueue: async function() {
    if (!this.estEnLigne) return;
    var queue = this.lireLocal('queue');
    if (!queue || !queue.donnees || !queue.donnees.length) return;
    for (var i = 0; i < queue.donnees.length; i++) {
      try { await this.executerAction(queue.donnees[i]); } catch (err) {}
    }
    localStorage.removeItem('tilex_queue');
  },

  executerAction: async function(action) {
    switch (action.type) {
      case 'SAUVEGARDER_MEMOIRE':
        if (window.YILO_MEMORY) await YILO_MEMORY.sauvegarder(action.data.type, action.data.contenu);
        break;
      case 'VALIDER_SOUVENIR':
        if (window.YILO_MEMORY) await YILO_MEMORY.valider(action.data.id);
        break;
    }
  },

  afficherNotifMiseAJour: function(registration) {
    var notif = document.createElement('div');
    notif.className = 'tilex-notif-maj';
    notif.innerHTML = '<span>Nouvelle version de Ti-lex disponible!</span> <button onclick="TilexOffline.appliquerMiseAJour()">Mettre a jour</button>';
    document.body.appendChild(notif);
    this._registration = registration;
  },

  appliquerMiseAJour: function() {
    if (this._registration && this._registration.waiting) {
      this._registration.waiting.postMessage('SKIP_WAITING');
      window.location.reload();
    }
  },

  afficherToast: function(message, type) {
    if (window.TilexToast) {
      if (typeof TilexToast.info === 'function' && type === 'succes') TilexToast.info(message);
      else if (typeof TilexToast.info === 'function') TilexToast.info(message);
    }
  }
};

document.addEventListener('DOMContentLoaded', function() { TilexOffline.init(); });
window.TilexOffline = TilexOffline;
