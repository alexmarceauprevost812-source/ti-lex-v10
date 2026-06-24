// tilex-offline.js — Indicateur de connexion + bannière offline

(function(){
  var banniere = document.getElementById('tilex-banniere-offline');
  var statut = document.getElementById('tilex-statut-connexion');

  function majStatut() {
    var enLigne = navigator.onLine;
    if (banniere) banniere.style.display = enLigne ? 'none' : 'flex';
    if (statut) {
      statut.className = 'tilex-statut ' + (enLigne ? 'en-ligne' : 'hors-ligne');
      statut.title = enLigne ? 'En ligne' : 'Hors ligne';
    }
  }

  window.addEventListener('online', majStatut);
  window.addEventListener('offline', majStatut);
  majStatut();
})();
