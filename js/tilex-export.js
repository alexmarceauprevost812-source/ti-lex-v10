// ============================================
// tilex-export.js — Export & Téléchargement
// Ti-lex-AL v10 — Alex Marceau-Prévost
// Pouvoir magique : télécharger index.html
// ============================================

const TilexExport = {

  // ============================================
  // TÉLÉCHARGER N'IMPORTE QUEL CONTENU
  // ============================================
  html(contenu, nom = 'index.html') {
    const blob = new Blob([contenu], { type: 'text/html;charset=utf-8' });
    this._declencher(blob, nom);
  },

  js(contenu, nom = 'script.js') {
    const blob = new Blob([contenu], { type: 'text/javascript;charset=utf-8' });
    this._declencher(blob, nom);
  },

  css(contenu, nom = 'style.css') {
    const blob = new Blob([contenu], { type: 'text/css;charset=utf-8' });
    this._declencher(blob, nom);
  },

  texte(contenu, nom = 'fichier.txt') {
    const blob = new Blob([contenu], { type: 'text/plain;charset=utf-8' });
    this._declencher(blob, nom);
  },

  // ============================================
  // TÉLÉCHARGER TOUT LE STUDIO EN UN CLIC
  // ============================================
  studioComplet() {
    // Garde : ne dépend du Studio que s'il expose telecharger().
    if (window.TilexStudio && typeof window.TilexStudio.telecharger === 'function') {
      window.TilexStudio.telecharger('ti-lex-projet.html');
    } else {
      console.warn('[TilexExport] TilexStudio.telecharger() indisponible.');
    }
  },

  // ============================================
  // INTERNE — déclenche le téléchargement
  // ============================================
  _declencher(blob, nom) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`📂 Téléchargé : ${nom}`);
  }

};

window.TilexExport = TilexExport;
