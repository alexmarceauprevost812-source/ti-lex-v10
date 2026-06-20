/* ════════════════════════════════════════════
   TILEX-ZIP.JS — ti-lex-AL v10
   Features 7,11,12,13 : ZIP + Animation +
   README auto + Mot de passe + Script CLI
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

/* ════════════════════════════════════════════
   FEATURE 12 : README AUTO-GÉNÉRÉ
════════════════════════════════════════════ */
TILEX.genererREADME = function(fichiers, nomProjet) {
  const nom     = nomProjet || 'Mon Projet';
  const today   = new Date().toLocaleDateString('fr-CA');
  const lignes  = [];

  // En-tête
  lignes.push(`# ${nom}`);
  lignes.push('');
  lignes.push(`> Structure générée par **ti-lex-AL v10** le ${today} · Produit du Québec ⚜️`);
  lignes.push('');

  // Stats
  const totalBytes = fichiers.reduce((s, f) => s + new Blob([f.contenu]).size, 0);
  lignes.push(`## 📊 Statistiques`);
  lignes.push('');
  lignes.push(`| Attribut | Valeur |`);
  lignes.push(`|----------|--------|`);
  lignes.push(`| Fichiers | ${fichiers.length} |`);
  lignes.push(`| Taille totale | ~${TILEX.formatBytes(totalBytes)} |`);
  lignes.push(`| Générée le | ${today} |`);
  lignes.push('');

  // Structure des dossiers
  lignes.push(`## 📁 Structure`);
  lignes.push('');
  lignes.push('```');

  // Construire l'arbre
  const arbre = {};
  fichiers.forEach(f => {
    const parts = f.nom.split('/');
    let node = arbre;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = null;
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    });
  });

  function rendreArbre(node, prefixe = '') {
    const cles = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null;
      const bDir = node[b] !== null;
      if (aDir && !bDir) return -1;
      if (!aDir && bDir) return 1;
      return a.localeCompare(b);
    });
    cles.forEach((cle, i) => {
      const est_dernier = i === cles.length - 1;
      const connecteur  = est_dernier ? '└── ' : '├── ';
      const extension   = est_dernier ? '    ' : '│   ';
      lignes.push(prefixe + connecteur + cle);
      if (node[cle] !== null) {
        rendreArbre(node[cle], prefixe + extension);
      }
    });
  }

  lignes.push(nom + '/');
  rendreArbre(arbre, '');
  lignes.push('```');
  lignes.push('');

  // Détail des fichiers
  lignes.push(`## 📄 Fichiers`);
  lignes.push('');
  lignes.push('| Fichier | Type | Taille | Lignes |');
  lignes.push('|---------|------|--------|--------|');
  fichiers.forEach(f => {
    const ext    = f.nom.split('.').pop().toUpperCase();
    const taille = TILEX.formatBytes(new Blob([f.contenu]).size);
    const lignesN = f.contenu.split('\n').length;
    lignes.push(`| \`${f.nom}\` | ${ext} | ${taille} | ${lignesN} |`);
  });
  lignes.push('');

  // Suggestions selon les fichiers
  const aJS   = fichiers.some(f => f.nom.endsWith('.js') || f.nom.endsWith('.ts'));
  const aPy   = fichiers.some(f => f.nom.endsWith('.py'));
  const aPkg  = fichiers.some(f => f.nom === 'package.json');
  const aSH   = fichiers.some(f => f.nom.endsWith('.sh'));
  const aMd   = fichiers.some(f => f.nom.endsWith('.md') && f.nom !== 'README.md');

  if (aJS || aPy || aPkg) {
    lignes.push(`## 🚀 Démarrage rapide`);
    lignes.push('');
    if (aPkg) {
      lignes.push('```bash');
      lignes.push('npm install');
      lignes.push('npm start');
      lignes.push('```');
    } else if (aPy) {
      lignes.push('```bash');
      lignes.push('pip install -r requirements.txt');
      lignes.push('python main.py');
      lignes.push('```');
    } else if (aSH) {
      lignes.push('```bash');
      lignes.push('chmod +x *.sh');
      lignes.push('./install.sh');
      lignes.push('```');
    }
    lignes.push('');
  }

  lignes.push(`## 📝 Notes`);
  lignes.push('');
  lignes.push('> Complète cette section avec les informations spécifiques à ton projet.');
  lignes.push('');
  lignes.push(`## 📄 Licence`);
  lignes.push('');
  lignes.push(`MIT · ${new Date().getFullYear()} · ti-lex-AL v10`);
  lignes.push('');

  return lignes.join('\n');
};

/* ════════════════════════════════════════════
   FEATURE 11 : ANIMATION DE GÉNÉRATION
════════════════════════════════════════════ */
TILEX.animation = {
  active: false,
};

TILEX.ouvrirAnimation = function(nomZip) {
  const overlay = document.getElementById('modal-animation');
  const projEl  = document.getElementById('anim-project-name');
  const barEl   = document.getElementById('anim-progress-bar');
  const curEl   = document.getElementById('anim-current-file');
  const logEl   = document.getElementById('anim-log');
  const doneEl  = document.getElementById('anim-done');

  if (!overlay) return;

  if (projEl) projEl.textContent = nomZip;
  if (barEl)  barEl.style.width  = '0%';
  if (curEl)  curEl.textContent  = 'Initialisation...';
  if (logEl)  logEl.innerHTML    = '';
  if (doneEl) doneEl.classList.add('hidden');

  TILEX.animation.active = true;
  overlay.classList.remove('hidden');
};

TILEX.majAnimation = function(idx, total, nomFichier) {
  const pct   = Math.round((idx / total) * 100);
  const barEl = document.getElementById('anim-progress-bar');
  const curEl = document.getElementById('anim-current-file');
  const logEl = document.getElementById('anim-log');

  if (barEl) barEl.style.width = pct + '%';
  if (curEl) curEl.textContent = '[' + idx + '/' + total + '] ' + nomFichier;

  if (logEl) {
    const line = document.createElement('div');
    line.className   = 'tx-anim-log-line';
    line.textContent = '✓ ' + nomFichier;
    logEl.appendChild(line);
    logEl.scrollTop  = logEl.scrollHeight;
  }
};

TILEX.terminerAnimation = function(nomZip, nbFichiers) {
  const barEl  = document.getElementById('anim-progress-bar');
  const curEl  = document.getElementById('anim-current-file');
  const doneEl = document.getElementById('anim-done');
  const txtEl  = document.getElementById('anim-done-text');

  if (barEl) barEl.style.width = '100%';
  if (curEl) curEl.textContent = 'Finalisation...';

  setTimeout(() => {
    if (doneEl) doneEl.classList.remove('hidden');
    if (txtEl)  txtEl.textContent = '✓ "' + nomZip + '" créé — ' + nbFichiers + ' fichier(s)';
    if (curEl)  curEl.textContent = '';

    // Fermer automatiquement après 2s
    setTimeout(() => {
      const overlay = document.getElementById('modal-animation');
      if (overlay) overlay.classList.add('hidden');
      TILEX.animation.active = false;
    }, 2000);
  }, 300);
};

/* ════════════════════════════════════════════
   FEATURE 13 : MOT DE PASSE SUR LE ZIP
════════════════════════════════════════════ */
TILEX.encrypterContenu = async function(contenu, motDePasse) {
  // Utilise Web Crypto API pour chiffrer le contenu
  const enc       = new TextEncoder();
  const keyMat    = await crypto.subtle.importKey(
    'raw', enc.encode(motDePasse),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const sel       = crypto.getRandomValues(new Uint8Array(16));
  const cle       = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt']
  );
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const donnees   = enc.encode(contenu);
  const chiffre   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, donnees);

  // Encoder : [salt(16)] + [iv(12)] + [données chiffrées]
  const resultat = new Uint8Array(16 + 12 + chiffre.byteLength);
  resultat.set(sel, 0);
  resultat.set(iv, 16);
  resultat.set(new Uint8Array(chiffre), 28);

  return btoa(String.fromCharCode(...resultat));
};

/* ════════════════════════════════════════════
   GÉNÉRATION ZIP PRINCIPALE (Features 11,12,13)
════════════════════════════════════════════ */
TILEX.genererZip = async function(mode = 'all') {
  if (typeof JSZip === 'undefined') {
    TILEX.toast('⚠ JSZip non chargé', 'alerte');
    return;
  }

  let fichiers = mode === 'selection'
    ? TILEX.getSelected()
    : TILEX.getAll();

  if (!fichiers.length) {
    TILEX.toast('⚠ Aucun fichier' + (mode === 'selection' ? ' sélectionné' : ''), 'alerte');
    return;
  }

  const nomZip    = TILEX.getNomZip();
  const motDePasse = TILEX.getMotDePasse();
  const avecReadme = document.getElementById('cb-readme')?.checked !== false;

  // Ajouter README auto
  let fichiersFinaux = [...fichiers];
  if (avecReadme) {
    const nomProjet = TILEX.state.nomProjet || nomZip.replace('.zip', '');
    const contenuREADME = TILEX.genererREADME(fichiers, nomProjet);
    const existeREADME  = fichiersFinaux.some(f => f.nom === 'README.md');
    if (!existeREADME) {
      fichiersFinaux.push({ id: '_readme', nom: 'README.md', contenu: contenuREADME, taille: new Blob([contenuREADME]).size });
    }
  }

  // Lancer l'animation
  TILEX.ouvrirAnimation(nomZip);

  try {
    const zip = new JSZip();

    // Attendre un tick pour que le DOM se mette à jour
    await new Promise(r => setTimeout(r, 80));

    for (let i = 0; i < fichiersFinaux.length; i++) {
      const f = fichiersFinaux[i];

      TILEX.majAnimation(i + 1, fichiersFinaux.length, f.nom);

      // Délai visuel entre chaque fichier (animation temps réel)
      await new Promise(r => setTimeout(r, Math.min(120, 800 / fichiersFinaux.length)));

      let contenu = f.contenu;

      // Feature 13 : chiffrer si mot de passe
      if (motDePasse) {
        try {
          const chiffre = await TILEX.encrypterContenu(contenu, motDePasse);
          contenu = '# CHIFFRÉ par ti-lex-AL\n# Utilise la clé fournie pour déchiffrer\n\n' + chiffre;
        } catch (e) {
          console.warn('[ti-lex] Chiffrement échoué pour', f.nom, e);
        }
      }

      // Créer les dossiers si chemin imbriqué
      const parts = f.nom.split('/');
      if (parts.length > 1) {
        let dossier = zip;
        for (let j = 0; j < parts.length - 1; j++) {
          dossier = dossier.folder(parts[j]);
        }
        dossier.file(parts[parts.length - 1], contenu);
      } else {
        zip.file(f.nom, contenu);
      }
    }

    // Générer le blob
    const blob = await zip.generateAsync({
      type:        'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Télécharger
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = nomZip;
    a.click();
    URL.revokeObjectURL(url);

    // Animation terminée
    TILEX.terminerAnimation(nomZip, fichiersFinaux.length);

    // Sauvegarder dans l'historique
    if (TILEX.sauvegarderHistorique) {
      await TILEX.sauvegarderHistorique(nomZip, fichiers, blob.size);
    }

    if (motDePasse) {
      TILEX.toast('🔒 ZIP chiffré AES-256 créé : ' + nomZip);
    } else {
      TILEX.toast('⬇ ' + nomZip + ' téléchargé — ' + fichiersFinaux.length + ' fichier(s)');
    }

  } catch (err) {
    console.error('[ti-lex] Erreur ZIP :', err);
    const overlay = document.getElementById('modal-animation');
    if (overlay) overlay.classList.add('hidden');
    TILEX.toast('❌ Erreur ZIP : ' + err.message, 'err');
  }
};

/* ════════════════════════════════════════════
   FEATURE 7 : SCRIPT CLI (BASH)
════════════════════════════════════════════ */
TILEX.telechargerCLI = function() {
  const fichiers = TILEX.getAll();
  if (!fichiers.length) {
    TILEX.toast('⚠ Aucun fichier à exporter', 'alerte');
    return;
  }

  const slug    = TILEX.slugifier(TILEX.state.nomProjet) || 'ti-lex-projet';
  const today   = new Date().toISOString().slice(0, 10);
  const total   = fichiers.length;

  const blocs = fichiers.map((f, i) => {
    const contenu = (f.contenu || '').replace(/^TILEX_EOF$/gm, 'TILEX_E0F_ESCAPED');
    return `
# ── Fichier ${i + 1}/${total} : ${f.nom} ──
anim ${i + 1} ${total} "${f.nom.replace(/"/g, '\\"')}"
mkdir -p "$(dirname "${f.nom.replace(/"/g, '\\"')}")" 2>/dev/null || true
cat > "${f.nom.replace(/"/g, '\\"')}" << 'TILEX_EOF'
${contenu}
TILEX_EOF`;
  }).join('\n');

  const script = `#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  Installateur : ${slug}
#  Généré par   : ti-lex-AL v10 · ${today}
#  Produit du Québec ⚜️
#  Usage : bash install-${slug}.sh [--force] [--sec DOSSIER]
# ═══════════════════════════════════════════════════
set -euo pipefail; IFS=$'\\n\\t'

readonly PROJET="${slug}"
readonly TOTAL=${total}
readonly DATE="${today}"

# ── Couleurs ──
R='\\033[0;31m' G='\\033[0;32m' Y='\\033[1;33m'
V='\\033[0;35m' C='\\033[0;36m' B='\\033[1m' X='\\033[0m'

log()  { echo -e "\${G}  ✓\${X} $*"; }
warn() { echo -e "\${Y}  ⚠\${X} $*"; }
err()  { echo -e "\${R}  ✗\${X} $*" >&2; exit 1; }
anim() { printf "\\r\${C}  [%d/%d]\${X} \${B}%-40s\${X}\\n" "$1" "$2" "$3"; }

# ── Arguments ──
FORCE=false; DEST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)   FORCE=true; shift ;;
    --sec|-s)     DEST="$2"; shift 2 ;;
    --aide|-h)    echo "Usage: bash install-${slug}.sh [--force] [--sec DIR]"; exit 0 ;;
    *)            err "Option inconnue: $1" ;;
  esac
done

# ── Bannière ──
echo ""; echo -e "\${V}\${B}╔══════════════════════════════════════╗\${X}"
echo -e "\${V}\${B}║  ti-lex-AL v10 · Installateur         ║\${X}"
echo -e "\${V}\${B}╚══════════════════════════════════════╝\${X}"
echo -e "  Projet  : \${B}${slug}\${X}"
echo -e "  Fichiers: \${B}${total}\${X}"
echo -e "  Date    : \${B}${today}\${X}"; echo ""

# ── Dossier cible ──
[[ -z "$DEST" ]] && DEST="$PROJET"
if [[ -d "$DEST" ]]; then
  if [[ "$FORCE" == "true" ]]; then warn "Dossier '$DEST' existe — écrasement (--force)"
  else
    read -r -p "  '$DEST' existe. Continuer ? [o/N] " rep
    [[ ! "$rep" =~ ^[oOyY] ]] && { echo "  Annulé."; exit 0; }
  fi
fi

mkdir -p "$DEST"; log "Dossier: ./$DEST/"; cd "$DEST"; echo ""
echo -e "  \${B}Création des fichiers :\${X}"; echo ""

# ── Fichiers ──
${blocs}

# ── Chmod scripts ──
find . -name "*.sh" -exec chmod +x {} \\; 2>/dev/null || true

# ── Résumé ──
echo ""
echo -e "\${G}\${B}╔══════════════════════════════════════╗\${X}"
echo -e "\${G}\${B}║  ✓ Installation terminée !            ║\${X}"
echo -e "\${G}\${B}╚══════════════════════════════════════╝\${X}"
echo -e "  Emplacement : \${B}$(pwd)\${X}"
echo -e "  Fichiers    : \${B}${total} créé(s)\${X}"; echo ""
echo -e "  \${C}Prochaines étapes :\${X}"
echo -e "    cd $DEST"
[[ -f "package.json" ]] && echo -e "    npm install"
[[ -f "requirements.txt" ]] && echo -e "    pip install -r requirements.txt"
[[ -f "Makefile" ]] && echo -e "    make"
[[ -f "index.html" ]] && echo -e "    open index.html"
echo ""
echo -e "  Produit du Québec ⚜️  · ti-lex-AL v10 · \${V}\${B}${today}\${X}"; echo ""
`;

  const blob = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `install-${slug}.sh`;
  a.click();
  URL.revokeObjectURL(url);

  TILEX.toast(`⌨️ "install-${slug}.sh" téléchargé · bash install-${slug}.sh`);
};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Fermer animation sur clic overlay
  const animOverlay = document.getElementById('modal-animation');
  if (animOverlay) {
    animOverlay.addEventListener('click', (e) => {
      if (e.target === animOverlay && !TILEX.animation.active) {
        animOverlay.classList.add('hidden');
      }
    });
  }
  console.log('[ti-lex] ZIP/CLI/Animation initialisés ✓');
});
