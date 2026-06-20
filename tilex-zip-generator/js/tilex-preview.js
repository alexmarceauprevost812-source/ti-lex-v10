/* ════════════════════════════════════════════
   TILEX-PREVIEW.JS — ti-lex-AL v10
   Feature 1 : Prévisualisation des fichiers
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

TILEX.preview = {
  fichierCourant: null,
};

/* ════════════════════════════════════════════
   BADGES DE LANGAGE
════════════════════════════════════════════ */
const BADGE_STYLES = {
  'badge-js':   'background:rgba(255,207,74,.15);color:#ffcf4a;border:1px solid rgba(255,207,74,.3)',
  'badge-ts':   'background:rgba(79,142,247,.15);color:#4f8ef7;border:1px solid rgba(79,142,247,.3)',
  'badge-html': 'background:rgba(255,100,60,.15);color:#ff643c;border:1px solid rgba(255,100,60,.3)',
  'badge-css':  'background:rgba(55,224,160,.15);color:#37e0a0;border:1px solid rgba(55,224,160,.3)',
  'badge-json': 'background:rgba(255,207,74,.1);color:#e0c060;border:1px solid rgba(255,207,74,.2)',
  'badge-md':   'background:rgba(160,120,255,.15);color:#c0a0ff;border:1px solid rgba(160,120,255,.3)',
  'badge-py':   'background:rgba(79,142,247,.12);color:#7ab0ff;border:1px solid rgba(79,142,247,.25)',
  'badge-sql':  'background:rgba(55,224,160,.1);color:#37e0a0;border:1px solid rgba(55,224,160,.2)',
  'badge-sh':   'background:rgba(107,107,128,.15);color:#9090a8;border:1px solid rgba(107,107,128,.3)',
  'badge-txt':  'background:rgba(107,107,128,.1);color:#6b6b80;border:1px solid rgba(107,107,128,.2)',
};

/* ════════════════════════════════════════════
   OUVRIR LA PREVIEW (Feature 1)
════════════════════════════════════════════ */
TILEX.ouvrirPreview = function(fichier) {
  TILEX.preview.fichierCourant = fichier;

  const overlay  = document.getElementById('modal-preview');
  const iconEl   = document.getElementById('preview-icon');
  const nomEl    = document.getElementById('preview-nom');
  const badgeEl  = document.getElementById('preview-badge');
  const tailleEl = document.getElementById('preview-taille');
  const lignesEl = document.getElementById('preview-lignes');
  const body     = document.getElementById('preview-body');

  if (!overlay || !body) return;

  const langInfo = TILEX.getLangInfo(fichier.nom);
  const lignes   = fichier.contenu.split('\n').length;
  const taille   = new Blob([fichier.contenu]).size;
  const ext      = fichier.nom.split('.').pop().toLowerCase();

  // Header
  if (iconEl)   iconEl.textContent = langInfo.icone || '📄';
  if (nomEl)    nomEl.textContent  = fichier.nom;
  if (badgeEl) {
    badgeEl.textContent = langInfo.badge || ext.toUpperCase();
    badgeEl.className   = 'tx-badge ' + (langInfo.cls || 'badge-txt');
    const style = BADGE_STYLES[langInfo.cls] || BADGE_STYLES['badge-txt'];
    badgeEl.setAttribute('style', style);
  }
  if (tailleEl) tailleEl.textContent = TILEX.formatBytes(taille);
  if (lignesEl) lignesEl.textContent = lignes.toLocaleString('fr-CA');

  // Corps
  body.innerHTML = '';
  TILEX.rendreContenuPreview(body, fichier, langInfo, lignes);

  // Ouvrir
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

TILEX.rendreContenuPreview = function(body, fichier, langInfo, nbLignes) {
  const ext = fichier.nom.split('.').pop().toLowerCase();

  // ── Markdown → rendu HTML ──
  if ((ext === 'md' || ext === 'mdx') && typeof marked !== 'undefined') {
    const div = document.createElement('div');
    div.className = 'tx-preview-markdown';
    marked.setOptions({ breaks: true, gfm: true });
    div.innerHTML = marked.parse(fichier.contenu);
    body.appendChild(div);
    return;
  }

  // ── Texte brut ──
  if (!langInfo.hljs) {
    const div = document.createElement('div');
    div.className   = 'tx-preview-brut';
    div.textContent = fichier.contenu;
    body.appendChild(div);
    return;
  }

  // ── Code avec syntax highlighting ──
  const wrap = document.createElement('div');
  wrap.className = 'tx-preview-code-wrap';

  // Numéros de lignes
  const nums = document.createElement('div');
  nums.className = 'tx-line-nums';
  for (let i = 1; i <= nbLignes; i++) {
    const s = document.createElement('span');
    s.textContent = i;
    nums.appendChild(s);
  }
  wrap.appendChild(nums);

  // Code
  const pre  = document.createElement('pre');
  const code = document.createElement('code');

  try {
    if (typeof hljs !== 'undefined') {
      const langs = hljs.listLanguages();
      if (langs.includes(langInfo.hljs)) {
        code.innerHTML = hljs.highlight(fichier.contenu, {
          language: langInfo.hljs,
          ignoreIllegals: true,
        }).value;
      } else {
        code.innerHTML = hljs.highlightAuto(fichier.contenu).value;
      }
      code.className = 'hljs language-' + langInfo.hljs;
    } else {
      code.textContent = fichier.contenu;
      code.className   = 'hljs';
    }
  } catch (_) {
    code.textContent = fichier.contenu;
    code.className   = 'hljs';
  }

  pre.appendChild(code);
  wrap.appendChild(pre);
  body.appendChild(wrap);

  // Sync scroll nums ↔ pre
  pre.addEventListener('scroll', () => { nums.scrollTop = pre.scrollTop; });
};

/* ════════════════════════════════════════════
   FERMER
════════════════════════════════════════════ */
TILEX.fermerPreview = function() {
  const overlay = document.getElementById('modal-preview');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
  TILEX.preview.fichierCourant = null;
};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-preview');
  const btnFerm = document.getElementById('preview-fermer');
  const btnCop  = document.getElementById('preview-copier');
  const btnDL   = document.getElementById('preview-dl');

  if (btnFerm) btnFerm.addEventListener('click', TILEX.fermerPreview);

  // Clic sur overlay = fermer
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) TILEX.fermerPreview();
  });

  // Copier depuis preview
  if (btnCop) btnCop.addEventListener('click', () => {
    const f = TILEX.preview.fichierCourant;
    if (!f) return;
    navigator.clipboard.writeText(f.contenu).then(() => {
      btnCop.textContent = '✓ Copié!';
      setTimeout(() => { btnCop.textContent = 'Copier'; }, 1800);
    });
  });

  // Télécharger depuis preview
  if (btnDL) btnDL.addEventListener('click', () => {
    const f = TILEX.preview.fichierCourant;
    if (!f) return;
    const blob = new Blob([f.contenu], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = f.nom.split('/').pop(); a.click();
    URL.revokeObjectURL(url);
    TILEX.toast('⬇ "' + f.nom + '" téléchargé');
  });

  console.log('[ti-lex] Preview initialisé ✓');
});
