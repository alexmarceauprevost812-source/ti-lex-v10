(function () {
  'use strict';

  function genererScriptBash(fichiers, nomProjet) {
    var slug  = slugifier(nomProjet) || 'mon-projet';
    var date  = new Date().toISOString().slice(0, 10);
    var total = fichiers.length;

    var blocsFichiers = '';
    fichiers.forEach(function (f, i) {
      var contenuEchappe = echapperPourHeredoc(f.contenu);
      blocsFichiers +=
        '\n# ── Fichier ' + (i + 1) + '/' + total + ' ──\n' +
        'afficher_progression ' + (i + 1) + ' ' + total + ' "' + echapperBash(f.nom) + '"\n\n';

      var dir = f.nom.lastIndexOf('/');
      if (dir !== -1) {
        blocsFichiers += 'mkdir -p "' + echapperBash(f.nom.substring(0, dir)) + '"\n';
      }

      blocsFichiers +=
        'cat > "' + echapperBash(f.nom) + '" << \'TILEX_EOF\'\n' +
        contenuEchappe + '\n' +
        'TILEX_EOF\n';
    });

    return '#!/usr/bin/env bash\n' +
      '# ═══════════════════════════════════════════════════\n' +
      '#  Script d\'installation : ' + slug + '\n' +
      '#  Généré par ti-lex v10 le ' + date + '\n' +
      '#  Usage : bash install.sh [--force] [--sec DOSSIER]\n' +
      '# ═══════════════════════════════════════════════════\n' +
      'set -euo pipefail\n' +
      'IFS=$\'\\n\\t\'\n' +
      '\n' +
      'readonly PROJET="' + slug + '"\n' +
      'readonly VERSION="1.0.0"\n' +
      'readonly TOTAL_FICHIERS=' + total + '\n' +
      'readonly DATE_GENERATION="' + date + '"\n' +
      '\n' +
      'ROUGE=\'\\033[0;31m\'\n' +
      'VERT=\'\\033[0;32m\'\n' +
      'JAUNE=\'\\033[1;33m\'\n' +
      'BLEU=\'\\033[0;34m\'\n' +
      'VIOLET=\'\\033[0;35m\'\n' +
      'CYAN=\'\\033[0;36m\'\n' +
      'GRAS=\'\\033[1m\'\n' +
      'RESET=\'\\033[0m\'\n' +
      '\n' +
      'FORCE=false\n' +
      'DOSSIER_CIBLE=""\n' +
      '\n' +
      'log()     { echo -e "${VERT}  ✓${RESET}  $*"; }\n' +
      'info()    { echo -e "${BLEU}  ℹ${RESET}  $*"; }\n' +
      'warn()    { echo -e "${JAUNE}  ⚠${RESET}  $*"; }\n' +
      'erreur()  { echo -e "${ROUGE}  ✗${RESET}  $*" >&2; exit 1; }\n' +
      '\n' +
      'afficher_progression() {\n' +
      '  local idx=$1 total=$2 nom=$3\n' +
      '  local pct=$(( idx * 100 / total ))\n' +
      '  printf "\\r${CYAN}  [%d/%d]${RESET} ${GRAS}%-40s${RESET} ${VIOLET}%3d%%${RESET}" \\\n' +
      '    "$idx" "$total" "$nom" "$pct"\n' +
      '  echo ""\n' +
      '}\n' +
      '\n' +
      'afficher_aide() {\n' +
      '  cat <<AIDE\n' +
      'Usage : bash install-' + slug + '.sh [OPTIONS]\n' +
      '\n' +
      'Options :\n' +
      '  --force,   -f         Écraser les fichiers existants sans demander\n' +
      '  --sec SEC, -s SEC     Installer dans le dossier SEC (défaut: ' + slug + '/)\n' +
      '  --version, -v         Afficher la version\n' +
      '  --aide,    -h         Afficher cette aide\n' +
      'AIDE\n' +
      '}\n' +
      '\n' +
      'while [[ $# -gt 0 ]]; do\n' +
      '  case "$1" in\n' +
      '    --force|-f)      FORCE=true; shift ;;\n' +
      '    --sec|-s)        DOSSIER_CIBLE="$2"; shift 2 ;;\n' +
      '    --aide|-h)       afficher_aide; exit 0 ;;\n' +
      '    --version|-v)    echo "$VERSION"; exit 0 ;;\n' +
      '    *)               echo -e "${ROUGE}Option inconnue : $1${RESET}" >&2; exit 1 ;;\n' +
      '  esac\n' +
      'done\n' +
      '\n' +
      'echo ""\n' +
      'echo -e "${GRAS}${VIOLET}╔══════════════════════════════════════════╗${RESET}"\n' +
      'echo -e "${GRAS}${VIOLET}║  ti-lex v10 · Installateur de projet     ║${RESET}"\n' +
      'echo -e "${GRAS}${VIOLET}╚══════════════════════════════════════════╝${RESET}"\n' +
      'echo ""\n' +
      'echo -e "  ${GRAS}Projet  :${RESET} $PROJET"\n' +
      'echo -e "  ${GRAS}Fichiers:${RESET} $TOTAL_FICHIERS fichier(s)"\n' +
      'echo -e "  ${GRAS}Généré  :${RESET} $DATE_GENERATION"\n' +
      'echo ""\n' +
      '\n' +
      'if [[ -z "$DOSSIER_CIBLE" ]]; then\n' +
      '  DOSSIER_CIBLE="$PROJET"\n' +
      'fi\n' +
      '\n' +
      'if [[ -d "$DOSSIER_CIBLE" ]]; then\n' +
      '  if [[ "$FORCE" == "true" ]]; then\n' +
      '    warn "Le dossier \'$DOSSIER_CIBLE\' existe — les fichiers seront écrasés (--force)"\n' +
      '  else\n' +
      '    warn "Le dossier \'$DOSSIER_CIBLE\' existe déjà."\n' +
      '    echo -e "  Utilise ${GRAS}--force${RESET} pour écraser, ou ${GRAS}--sec NOUVEAU_DOSSIER${RESET} pour choisir un autre nom."\n' +
      '    echo ""\n' +
      '    read -r -p "  Continuer quand même ? [o/N] " reponse\n' +
      '    if [[ ! "$reponse" =~ ^[oOyY] ]]; then\n' +
      '      echo -e "\\n  Annulé."\n' +
      '      exit 0\n' +
      '    fi\n' +
      '  fi\n' +
      'fi\n' +
      '\n' +
      'mkdir -p "$DOSSIER_CIBLE"\n' +
      'info "Dossier créé : ./$DOSSIER_CIBLE/"\n' +
      'echo ""\n' +
      'cd "$DOSSIER_CIBLE"\n' +
      '\n' +
      'echo -e "  ${GRAS}Création des fichiers :${RESET}\\n"\n' +
      blocsFichiers + '\n' +
      'find . -name "*.sh" -exec chmod +x {} \\;\n' +
      '\n' +
      'echo ""\n' +
      'echo -e "${GRAS}${VERT}╔══════════════════════════════════════════╗${RESET}"\n' +
      'echo -e "${GRAS}${VERT}║  ✓ Installation terminée avec succès !   ║${RESET}"\n' +
      'echo -e "${GRAS}${VERT}╚══════════════════════════════════════════╝${RESET}"\n' +
      'echo ""\n' +
      'echo -e "  ${GRAS}Emplacement :${RESET} $(pwd)"\n' +
      'echo -e "  ${GRAS}Fichiers    :${RESET} $TOTAL_FICHIERS créé(s)"\n' +
      'echo ""\n' +
      'echo -e "  ${CYAN}Prochaines étapes :${RESET}"\n' +
      'echo -e "    cd $DOSSIER_CIBLE"\n' +
      '[[ -f "package.json" ]] && echo -e "    npm install"\n' +
      '[[ -f "requirements.txt" ]] && echo -e "    pip install -r requirements.txt"\n' +
      '[[ -f "Makefile" ]] && echo -e "    make"\n' +
      '[[ -f "index.html" ]] && echo -e "    open index.html"\n' +
      '[[ -f "main.py" ]] && echo -e "    python main.py"\n' +
      'echo ""\n' +
      'echo -e "  Produit du Québec ⚜️  · ${VIOLET}ti-lex v10${RESET}"\n' +
      'echo ""\n';
  }

  function echapperPourHeredoc(contenu) {
    return (contenu || '').replace(/^TILEX_EOF$/gm, 'TILEX_E0F_ESCAPED');
  }

  function echapperBash(valeur) {
    return (valeur || '').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  function slugifier(valeur) {
    return (valeur || '')
      .trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9.\-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function telechargerScriptCLI() {
    if (!window.tilexFichiers) {
      afficherToast('⚠ Module fichiers non disponible');
      return;
    }

    var fichiers = window.tilexFichiers.getAll();
    if (fichiers.length === 0) {
      afficherToast('⚠ Aucun fichier à exporter');
      return;
    }

    var inputNom  = document.getElementById('projet-nom-input');
    var nomProjet = inputNom ? inputNom.value.trim() : '';

    var script  = genererScriptBash(fichiers, nomProjet);
    var blob    = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
    var url     = URL.createObjectURL(blob);
    var nomSlug = slugifier(nomProjet) || 'ti-lex-projet';
    var a       = document.createElement('a');
    a.href      = url;
    a.download  = 'install-' + nomSlug + '.sh';
    a.click();
    URL.revokeObjectURL(url);

    afficherToast('⌨️ "install-' + nomSlug + '.sh" téléchargé');
  }

  function afficherToast(msg) {
    var toast = document.getElementById('tilex-toast-global');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tilex-toast-global';
      toast.className = 'tilex-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('visible'); }, 3000);
  }

  var btn = document.getElementById('btn-script-cli');
  if (btn) {
    btn.addEventListener('click', telechargerScriptCLI);
  }

  window.tilexCLI = {
    generer:     genererScriptBash,
    telecharger: telechargerScriptCLI
  };
})();
