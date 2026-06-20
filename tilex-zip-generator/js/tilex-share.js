/* ════════════════════════════════════════════
   TILEX-SHARE.JS — ti-lex-AL v10
   Feature 5 : Partage via lien URL unique
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

/* ════════════════════════════════════════════
   ENCODAGE
════════════════════════════════════════════ */
TILEX.encoderStructure = function(fichiers, nomProjet) {
  const payload = {
    v:       2,
    nom:     nomProjet || '',
    date:    new Date().toISOString().slice(0, 10),
    fichiers: fichiers.map(f => ({ n: f.nom, c: f.contenu })),
  };
  const json = JSON.stringify(payload);
  const b64  = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

TILEX.genererLienPartage = function() {
  const fichiers    = TILEX.getAll();
  if (!fichiers.length) return null;

  const nomProjet   = TILEX.state.nomProjet;
  const encoded     = TILEX.encoderStructure(fichiers, nomProjet);
  const url         = new URL(window.location.href);
  url.searchParams.set('structure', encoded);
  if (nomProjet) url.searchParams.set('projet', nomProjet);
  return url.toString();
};

/* ════════════════════════════════════════════
   MODAL PARTAGE
════════════════════════════════════════════ */
TILEX.ouvrirModalPartage = function() {
  const lien = TILEX.genererLienPartage();
  if (!lien) {
    TILEX.toast('⚠ Aucun fichier à partager', 'alerte');
    return;
  }

  const overlay   = document.getElementById('modal-partage');
  const lienInput = document.getElementById('partage-lien');
  const descEl    = document.getElementById('partage-desc');
  const statsEl   = document.getElementById('partage-stats');
  const alerteEl  = document.getElementById('partage-alerte');

  if (!overlay) return;

  const fichiers  = TILEX.getAll();
  const estLong   = lien.length > 8000;

  if (lienInput) lienInput.value = lien;
  if (descEl) descEl.innerHTML = `Ce lien encode <strong>${fichiers.length} fichier(s)</strong> dans l'URL. La personne qui l'ouvre verra les fichiers importés automatiquement.`;
  if (statsEl) statsEl.innerHTML = `<span>📁 ${fichiers.length} fichier(s)</span><span>⚖ ${lien.length} caractères</span><span>📅 ${new Date().toLocaleDateString('fr-CA')}</span>`;
  if (alerteEl) alerteEl.classList.toggle('hidden', !estLong);

  overlay.classList.remove('hidden');

  setTimeout(() => {
    if (lienInput) { lienInput.select(); }
  }, 100);
};

TILEX.fermerModalPartage = function() {
  const overlay = document.getElementById('modal-partage');
  if (overlay) overlay.classList.add('hidden');
};

/* ════════════════════════════════════════════
   COPIER LE LIEN
════════════════════════════════════════════ */
TILEX.copierLienPartage = function() {
  const lien = TILEX.genererLienPartage();
  if (!lien) return;
  navigator.clipboard.writeText(lien).then(() => {
    TILEX.toast('🔗 Lien copié !');
    ['partage-copier', 'partage-copier2'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copié!';
        setTimeout(() => { btn.textContent = orig; }, 1800);
      }
    });
  });
};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const fermer  = document.getElementById('partage-fermer');
  const copier1 = document.getElementById('partage-copier');
  const copier2 = document.getElementById('partage-copier2');
  const ouvrir  = document.getElementById('partage-ouvrir');
  const overlay = document.getElementById('modal-partage');

  if (fermer)  fermer.addEventListener('click', TILEX.fermerModalPartage);
  if (copier1) copier1.addEventListener('click', TILEX.copierLienPartage);
  if (copier2) copier2.addEventListener('click', TILEX.copierLienPartage);

  if (ouvrir) ouvrir.addEventListener('click', () => {
    const lien = TILEX.genererLienPartage();
    if (lien) window.open(lien, '_blank', 'noopener');
  });

  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) TILEX.fermerModalPartage();
  });

  console.log('[ti-lex] Partage initialisé ✓');
});
