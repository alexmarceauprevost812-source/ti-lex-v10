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
    this._registration = registration;
    var nouveau = registration.installing || registration.waiting;
    if (!nouveau) return;

    function montrer() {
      // Jamais au premier install (aucun SW ne controle encore la page).
      if (!navigator.serviceWorker.controller) return;
      // UNE SEULE banniere a la fois — plus jamais d'empilement (le bug qui
      // faisait apparaitre une dizaine de « Mettre a jour » en bas de l'ecran).
      if (document.getElementById('tilex-notif-maj')) return;
      var notif = document.createElement('div');
      notif.id = 'tilex-notif-maj';
      notif.className = 'tilex-notif-maj';
      notif.innerHTML =
        '<span>Nouvelle version de Ti-lex disponible!</span>' +
        ' <button onclick="TilexOffline.appliquerMiseAJour()">Mettre a jour</button>' +
        ' <button class="tilex-notif-x" aria-label="Fermer" title="Fermer" ' +
        'onclick="this.parentNode.remove()" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>';
      document.body.appendChild(notif);
      // Disparait toute seule apres 10 s (l'app se met a jour au refresh de toute facon).
      setTimeout(function () { var n = document.getElementById('tilex-notif-maj'); if (n) n.remove(); }, 10000);
    }

    if (registration.waiting) { montrer(); return; }
    if (registration.installing) {
      registration.installing.addEventListener('statechange', function () {
        if (this.state === 'installed') montrer();
      });
    }
  },

  appliquerMiseAJour: function() {
    var n = document.getElementById('tilex-notif-maj');
    if (n) n.remove();
    var reg = this._registration;
    if (reg && reg.waiting) { reg.waiting.postMessage('SKIP_WAITING'); }
    window.location.reload();
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
