/* ════════════════════════════════════════════
   TILEX-CORE.JS — ti-lex-AL v10
   État central · CRUD fichiers · Sélection · Stats · UI
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

/* ════════════════════════════════════════════
   ÉTAT CENTRAL
════════════════════════════════════════════ */
TILEX.state = {
  fichiers:    [],
  selection:   new Set(),
  nomProjet:   '',
  dernierModele: null,
};

/* ════════════════════════════════════════════
   HELPERS UTILITAIRES
════════════════════════════════════════════ */
TILEX.genId = () => '_' + Math.random().toString(36).slice(2, 9);

TILEX.formatBytes = function(bytes) {
  if (!bytes || bytes === 0) return '0 o';
  if (bytes < 1024)         return bytes + ' o';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
};

TILEX.slugifier = function(v) {
  return (v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9.\-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
};

TILEX.getNomZip = function() {
  const slug = TILEX.slugifier(TILEX.state.nomProjet);
  if (slug) return slug.endsWith('.zip') ? slug : slug + '.zip';
  return 'ti-lex-' + new Date().toISOString().slice(0, 10) + '.zip';
};

TILEX.toast = function(msg, type = 'ok') {
  const el = document.getElementById('tx-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'tx-toast visible' + (type === 'alerte' ? ' alerte' : type === 'err' ? ' erreur' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 2800);
};

/* ════════════════════════════════════════════
   CRUD FICHIERS
════════════════════════════════════════════ */
TILEX.ajouterFichier = function(nom, contenu, silencieux = false) {
  nom = nom.trim();
  if (!nom) return null;

  // Doublon ?
  if (TILEX.state.fichiers.find(f => f.nom === nom)) {
    if (!silencieux) TILEX.toast('⚠ "' + nom + '" existe déjà', 'alerte');
    return null;
  }

  const fichier = {
    id:      TILEX.genId(),
    nom:     nom,
    contenu: contenu || '',
    taille:  new Blob([contenu || '']).size,
  };

  TILEX.state.fichiers.push(fichier);
  if (!silencieux) TILEX.toast('✓ "' + nom + '" ajouté');
  TILEX.rendreListe();
  TILEX.mettreAJourStats();
  return fichier;
};

TILEX.supprimerFichier = function(id) {
  TILEX.state.fichiers = TILEX.state.fichiers.filter(f => f.id !== id);
  TILEX.state.selection.delete(id);
  TILEX.rendreListe();
  TILEX.mettreAJourStats();
  TILEX.mettreAJourToolbarSelection();
};

TILEX.viderTout = function() {
  if (!TILEX.state.fichiers.length) return;
  if (!confirm('Supprimer tous les ' + TILEX.state.fichiers.length + ' fichier(s) ?')) return;
  TILEX.state.fichiers = [];
  TILEX.state.selection.clear();
  TILEX.rendreListe();
  TILEX.mettreAJourStats();
  TILEX.mettreAJourToolbarSelection();
};

/* ════════════════════════════════════════════
   SÉLECTION
════════════════════════════════════════════ */
TILEX.toggleSelection = function(id, coche, card) {
  if (coche) {
    TILEX.state.selection.add(id);
    card.classList.add('selectionnee');
  } else {
    TILEX.state.selection.delete(id);
    card.classList.remove('selectionnee');
  }
  TILEX.mettreAJourToolbarSelection();
};

TILEX.toutSelectionner = function() {
  document.querySelectorAll('.tx-file-cb').forEach(cb => {
    cb.checked = true;
    TILEX.state.selection.add(cb.dataset.id);
    cb.closest('.tx-file-card').classList.add('selectionnee');
  });
  TILEX.mettreAJourToolbarSelection();
};

TILEX.toutDeselectionner = function() {
  document.querySelectorAll('.tx-file-cb').forEach(cb => {
    cb.checked = false;
    cb.closest('.tx-file-card').classList.remove('selectionnee');
  });
  TILEX.state.selection.clear();
  TILEX.mettreAJourToolbarSelection();
};

TILEX.supprimerSelection = function() {
  const n = TILEX.state.selection.size;
  if (!n) return;
  if (!confirm('Supprimer ' + n + ' fichier(s) ?')) return;
  const ids = [...TILEX.state.selection];
  ids.forEach(id => {
    TILEX.state.fichiers = TILEX.state.fichiers.filter(f => f.id !== id);
    TILEX.state.selection.delete(id);
  });
  TILEX.rendreListe();
  TILEX.mettreAJourStats();
  TILEX.mettreAJourToolbarSelection();
  TILEX.toast('🗑 ' + n + ' fichier(s) supprimé(s)');
};

TILEX.mettreAJourToolbarSelection = function() {
  const toolbar = document.getElementById('selection-toolbar');
  const count   = document.getElementById('sel-count');
  const n       = TILEX.state.selection.size;
  const total   = TILEX.state.fichiers.length;

  if (!toolbar) return;

  if (n > 0) {
    toolbar.classList.remove('hidden');
    count.textContent = n + ' / ' + total + ' sélectionné(s)';
  } else {
    toolbar.classList.add('hidden');
  }
};

/* ════════════════════════════════════════════
   STATS (Feature 10)
════════════════════════════════════════════ */
TILEX.getStats = function() {
  const fichiers = TILEX.state.fichiers;
  const count    = fichiers.length;
  const bytes    = fichiers.reduce((s, f) => s + (f.taille || 0), 0);
  return { count, bytes, label: count + ' fichier' + (count > 1 ? 's' : '') + ' · ~' + TILEX.formatBytes(bytes) };
};

TILEX.mettreAJourStats = function() {
  const stats = TILEX.getStats();
  const el    = document.getElementById('stats-badge');
  const cnt   = document.getElementById('stats-count');
  const sz    = document.getElementById('stats-size');

  if (cnt) cnt.textContent = stats.count + ' fichier' + (stats.count > 1 ? 's' : '');
  if (sz)  sz.textContent  = '~' + TILEX.formatBytes(stats.bytes);
  if (el)  el.style.opacity = stats.count > 0 ? '1' : '0.4';

  // Actions bar
  const actionsBar = document.getElementById('actions-bar');
  if (actionsBar) {
    actionsBar.style.display = stats.count > 0 ? 'flex' : 'none';
  }
};

/* ════════════════════════════════════════════
   RENDU DE LA LISTE (Feature 2 : sélection)
════════════════════════════════════════════ */
TILEX.rendreListe = function() {
  const liste = document.getElementById('file-list');
  const empty = document.getElementById('empty-state');
  if (!liste) return;

  const fichiers = TILEX.state.fichiers;

  if (fichiers.length === 0) {
    liste.innerHTML = '';
    if (empty) liste.appendChild(empty);
    if (empty) empty.style.display = 'flex';
    return;
  }

  // Enlever l'état vide
  if (empty) empty.style.display = 'none';

  // Reconstruire les cartes
  // Garder les cartes existantes si elles n'ont pas changé
  const idsExistants = new Set([...liste.querySelectorAll('.tx-file-card')].map(c => c.dataset.id));
  const idsFichiers  = new Set(fichiers.map(f => f.id));

  // Supprimer les cartes obsolètes
  liste.querySelectorAll('.tx-file-card').forEach(card => {
    if (!idsFichiers.has(card.dataset.id)) card.remove();
  });

  // Ajouter les nouvelles cartes
  fichiers.forEach(f => {
    if (!idsExistants.has(f.id)) {
      const card = TILEX.creerCarte(f);
      liste.appendChild(card);
    }
  });
};

TILEX.creerCarte = function(fichier) {
  const langInfo = TILEX.getLangInfo(fichier.nom);
  const card = document.createElement('div');
  card.className   = 'tx-file-card';
  card.dataset.id  = fichier.id;

  card.innerHTML = `
    <label class="tx-file-cb-wrap" title="Sélectionner" onclick="event.stopPropagation()">
      <input type="checkbox" class="tx-file-cb" data-id="${fichier.id}" />
      <span class="tx-file-cb-box"></span>
    </label>
    <span class="tx-file-icon">${langInfo.icone}</span>
    <div class="tx-file-info">
      <div class="tx-file-nom" title="${fichier.nom}">${fichier.nom}</div>
      <div class="tx-file-meta">
        <span>${TILEX.formatBytes(fichier.taille)}</span>
        <span>${fichier.contenu.split('\n').length} lignes</span>
        <span class="tx-badge ${langInfo.cls}">${langInfo.badge}</span>
      </div>
    </div>
    <div class="tx-file-btns">
      <button class="tx-btn-sm btn-voir"    data-id="${fichier.id}" title="Prévisualiser">👁</button>
      <button class="tx-btn-sm btn-copier"  data-id="${fichier.id}" title="Copier">📋</button>
      <button class="tx-btn-sm btn-suppr tx-btn-danger" data-id="${fichier.id}" title="Supprimer">✕</button>
    </div>
  `;

  // Checkbox
  const cb = card.querySelector('.tx-file-cb');
  if (TILEX.state.selection.has(fichier.id)) {
    cb.checked = true;
    card.classList.add('selectionnee');
  }
  cb.addEventListener('change', () => {
    TILEX.toggleSelection(fichier.id, cb.checked, card);
  });

  // Clic carte → toggle checkbox
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.tx-file-btns') && !e.target.closest('.tx-file-cb-wrap')) {
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    }
  });

  // Voir
  card.querySelector('.btn-voir').addEventListener('click', (e) => {
    e.stopPropagation();
    if (TILEX.ouvrirPreview) TILEX.ouvrirPreview(fichier);
  });

  // Copier
  card.querySelector('.btn-copier').addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fichier.contenu).then(() => {
      TILEX.toast('📋 "' + fichier.nom + '" copié');
    });
  });

  // Supprimer
  card.querySelector('.btn-suppr').addEventListener('click', (e) => {
    e.stopPropagation();
    TILEX.supprimerFichier(fichier.id);
  });

  return card;
};

/* ════════════════════════════════════════════
   FORMULAIRE D'AJOUT
════════════════════════════════════════════ */
TILEX.initFormulaire = function() {
  const inputNom     = document.getElementById('input-nom-fichier');
  const inputContenu = document.getElementById('input-contenu');
  const btnAjouter   = document.getElementById('btn-ajouter');
  const badge        = document.getElementById('badge-template');
  const badgeNom     = document.getElementById('badge-template-nom');
  const btnReset     = document.getElementById('btn-reset-template');

  if (!inputNom) return;

  // Auto-remplissage (Feature 4)
  inputNom.addEventListener('input', () => {
    clearTimeout(inputNom._t);
    inputNom._t = setTimeout(() => {
      const modele = TILEX.getContentTemplate(inputNom.value);
      if (!modele) return;

      const vide    = inputContenu.value.trim() === '';
      const estMeme = inputContenu.value === TILEX.state.dernierModele;

      if (vide || estMeme) {
        inputContenu.value       = modele;
        TILEX.state.dernierModele = modele;
        if (badge)   badge.classList.remove('hidden');
        if (badgeNom) badgeNom.textContent = inputNom.value;
      }
    }, 320);
  });

  inputContenu.addEventListener('input', () => {
    if (inputContenu.value !== TILEX.state.dernierModele) {
      // Utilisateur a modifié
    }
  });

  if (btnReset) btnReset.addEventListener('click', () => {
    const modele = TILEX.getContentTemplate(inputNom.value);
    if (modele) {
      inputContenu.value       = modele;
      TILEX.state.dernierModele = modele;
    }
  });

  // Ctrl+Enter = ajouter
  inputContenu.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      btnAjouter.click();
    }
  });

  // Enter dans nom = focus textarea
  inputNom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inputContenu.focus(); }
  });

  btnAjouter.addEventListener('click', () => {
    const nom     = inputNom.value.trim();
    const contenu = inputContenu.value;
    if (!nom) { inputNom.focus(); return; }

    const f = TILEX.ajouterFichier(nom, contenu);
    if (f) {
      inputNom.value     = '';
      inputContenu.value = '';
      TILEX.state.dernierModele = null;
      if (badge) badge.classList.add('hidden');
      inputNom.focus();
    }
  });
};

/* ════════════════════════════════════════════
   NOM DE PROJET (Feature 3)
════════════════════════════════════════════ */
TILEX.initNomProjet = function() {
  const input  = document.getElementById('input-nom-projet');
  const apercu = document.getElementById('apercu-zip');
  const LS_KEY = 'tilex_nom_projet';

  if (!input) return;

  // Charger depuis localStorage
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    input.value          = saved;
    TILEX.state.nomProjet = saved;
  }

  const update = () => {
    TILEX.state.nomProjet = input.value.trim();
    if (apercu) apercu.innerHTML = 'ZIP : <em>' + TILEX.getNomZip() + '</em>';
    clearTimeout(input._t);
    input._t = setTimeout(() => localStorage.setItem(LS_KEY, input.value.trim()), 500);
  };

  input.addEventListener('input', update);

  input.addEventListener('blur', () => {
    input.value = TILEX.slugifier(input.value);
    update();
  });

  update();
};

/* ════════════════════════════════════════════
   MOT DE PASSE (Feature 13)
════════════════════════════════════════════ */
TILEX.getMotDePasse = function() {
  const input = document.getElementById('input-mdp');
  return input ? input.value : '';
};

TILEX.initMotDePasse = function() {
  const input  = document.getElementById('input-mdp');
  const btnOeil = document.getElementById('btn-toggle-mdp');
  if (!input || !btnOeil) return;

  btnOeil.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    btnOeil.textContent = input.type === 'password' ? '👁' : '🙈';
  });
};

/* ════════════════════════════════════════════
   TEMPLATES DE PROJETS (Feature 9)
════════════════════════════════════════════ */
TILEX.initTemplatesBar = function() {
  document.querySelectorAll('.tx-template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.template;
      if (!key) return;

      if (key === 'vide') {
        TILEX.viderTout();
        document.querySelectorAll('.tx-template-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        return;
      }

      const tplFichiers = TILEX.chargerTemplate(key);
      if (!tplFichiers || !tplFichiers.length) return;

      const msg = TILEX.state.fichiers.length > 0
        ? 'Remplacer les ' + TILEX.state.fichiers.length + ' fichier(s) actuels par le template "' + key + '" ?'
        : null;

      if (msg && !confirm(msg)) return;

      TILEX.state.fichiers  = [];
      TILEX.state.selection = new Set();

      const listEl = document.getElementById('file-list');
      if (listEl) listEl.innerHTML = '';

      tplFichiers.forEach(f => TILEX.ajouterFichier(f.nom, f.contenu, true));

      document.querySelectorAll('.tx-template-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Nom du projet = nom du template
      const tpl = TILEX.projectTemplates[key];
      if (tpl && tpl.nom) {
        const inputNom = document.getElementById('input-nom-projet');
        if (inputNom) {
          inputNom.value = TILEX.slugifier(tpl.nom);
          inputNom.dispatchEvent(new Event('input'));
        }
      }

      TILEX.toast('⚡ Template "' + (tpl ? tpl.nom : key) + '" chargé — ' + tplFichiers.length + ' fichier(s)');
    });
  });
};

/* ════════════════════════════════════════════
   ACTIONS GLOBALES
════════════════════════════════════════════ */
TILEX.initActions = function() {
  // Tout effacer
  const btnEffacer = document.getElementById('btn-tout-suppr');
  if (btnEffacer) btnEffacer.addEventListener('click', TILEX.viderTout);

  // Sélection toolbar
  const btnTout   = document.getElementById('btn-tout-sel');
  const btnAucun  = document.getElementById('btn-tout-desel');
  const btnSuppr  = document.getElementById('btn-suppr-sel');
  const btnZipSel = document.getElementById('btn-zip-sel');

  if (btnTout)   btnTout.addEventListener('click',   TILEX.toutSelectionner);
  if (btnAucun)  btnAucun.addEventListener('click',  TILEX.toutDeselectionner);
  if (btnSuppr)  btnSuppr.addEventListener('click',  TILEX.supprimerSelection);
  if (btnZipSel) btnZipSel.addEventListener('click', () => {
    if (TILEX.genererZip) TILEX.genererZip('selection');
  });

  // ZIP global
  const btnZip = document.getElementById('btn-zip-all');
  if (btnZip) btnZip.addEventListener('click', () => {
    if (TILEX.genererZip) TILEX.genererZip('all');
  });

  // CLI
  const btnCli = document.getElementById('btn-cli');
  if (btnCli) btnCli.addEventListener('click', () => {
    if (TILEX.telechargerCLI) TILEX.telechargerCLI();
  });

  // Partager
  const btnPartager = document.getElementById('btn-partager');
  if (btnPartager) btnPartager.addEventListener('click', () => {
    if (TILEX.ouvrirModalPartage) TILEX.ouvrirModalPartage();
  });

  // Historique
  const btnHist = document.getElementById('btn-historique');
  if (btnHist) btnHist.addEventListener('click', () => {
    if (TILEX.ouvrirHistorique) TILEX.ouvrirHistorique();
  });

  // Thème
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', () => {
    if (TILEX.ouvrirModalTheme) TILEX.ouvrirModalTheme();
  });
};

/* ════════════════════════════════════════════
   RACCOURCIS CLAVIER
════════════════════════════════════════════ */
TILEX.initRaccourcis = function() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    const enChamp = (tag === 'INPUT' || tag === 'TEXTAREA');

    // Échap → fermer modals ouverts
    if (e.key === 'Escape') {
      document.querySelectorAll('.tx-modal-overlay:not(.hidden)').forEach(m => {
        m.classList.add('hidden');
      });
      TILEX.toutDeselectionner();
    }

    if (enChamp) return;

    // Ctrl+A → tout sélectionner
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && TILEX.state.fichiers.length > 0) {
      e.preventDefault();
      TILEX.toutSelectionner();
    }

    // Suppr → supprimer sélection
    if (e.key === 'Delete' && TILEX.state.selection.size > 0) {
      TILEX.supprimerSelection();
    }
  });
};

/* ════════════════════════════════════════════
   IMPORT DEPUIS URL (Feature 5 — côté réception)
════════════════════════════════════════════ */
TILEX.importerDepuisURL = function() {
  const params  = new URLSearchParams(window.location.search);
  const encoded = params.get('structure');
  if (!encoded) return;

  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const json    = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json);

    if (!payload.fichiers || !Array.isArray(payload.fichiers)) throw new Error('Format invalide');

    let n = 0;
    payload.fichiers.forEach(f => {
      if (f.n && typeof f.c === 'string') {
        TILEX.ajouterFichier(f.n, f.c, true);
        n++;
      }
    });

    if (payload.nom) {
      const inputNom = document.getElementById('input-nom-projet');
      if (inputNom) {
        inputNom.value = payload.nom;
        inputNom.dispatchEvent(new Event('input'));
      }
    }

    // Nettoyer l'URL
    const url = new URL(window.location.href);
    url.searchParams.delete('structure');
    url.searchParams.delete('projet');
    window.history.replaceState({}, '', url.toString());

    // Bannière d'import
    const banniere = document.createElement('div');
    banniere.style.cssText = `
      position:fixed;top:52px;left:0;right:0;
      background:rgba(55,224,160,0.1);border-bottom:1px solid rgba(55,224,160,0.3);
      color:#37e0a0;font-size:11px;padding:8px 20px;
      display:flex;align-items:center;gap:10px;z-index:200;font-family:inherit;
    `;
    banniere.innerHTML = `📥 ${n} fichier(s) importé(s) depuis un lien partagé` +
      (payload.nom ? ` · <strong>${payload.nom}</strong>` : '') +
      ` <button onclick="this.parentNode.remove()" style="margin-left:auto;background:none;border:none;color:inherit;cursor:pointer;">✕</button>`;
    document.body.appendChild(banniere);
    setTimeout(() => { if (banniere.parentNode) banniere.remove(); }, 7000);

    TILEX.toast('📥 ' + n + ' fichier(s) importés');
  } catch (err) {
    console.error('[ti-lex] Import URL échoué :', err);
    TILEX.toast('⚠ Lien invalide', 'alerte');
  }
};

/* ════════════════════════════════════════════
   API PUBLIQUE (pour autres modules)
════════════════════════════════════════════ */
TILEX.getAll       = () => [...TILEX.state.fichiers];
TILEX.getSelected  = () => TILEX.state.fichiers.filter(f => TILEX.state.selection.has(f.id));
TILEX.getLangInfo  = (nom) => TILEX.langMap ? TILEX.langMap[nom.split('.').pop().toLowerCase()] || { hljs: null, badge: 'TXT', cls: 'badge-txt', icone: '📄' } : { hljs: null, badge: 'TXT', cls: 'badge-txt', icone: '📄' };

/* ════════════════════════════════════════════
   INIT GLOBAL
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  TILEX.initFormulaire();
  TILEX.initNomProjet();
  TILEX.initMotDePasse();
  TILEX.initTemplatesBar();
  TILEX.initActions();
  TILEX.initRaccourcis();

  // Stats initiales
  TILEX.mettreAJourStats();
  document.getElementById('actions-bar').style.display = 'none';

  // Import URL si paramètre présent
  if (window.location.search.includes('structure=')) {
    setTimeout(TILEX.importerDepuisURL, 100);
  }

  console.log('[ti-lex] Core initialisé ✓');
});
