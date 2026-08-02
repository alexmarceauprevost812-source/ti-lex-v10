'use strict';

var CATEGORIES_PROTECTION = [
  {
    id: "mots-passe",
    icon: "🔑",
    titre: "Mots de passe & Accès",
    risque: "CRITIQUE",
    couleurRisque: "#ff3b3b",
    actions: [
      { quoi: "Utiliser un mot de passe fort", comment: "Minimum 16 caractères : majuscules, minuscules, chiffres et symboles (ex. : G#7kP!mR2xQw@9Lv)", impact: "Empêche 90 % des attaques par force brute" },
      { quoi: "Activer l'authentification à 2 facteurs (2FA)", comment: "Utiliser une app comme Google Authenticator ou Authy sur chaque compte admin", impact: "Même si le mot de passe est volé, le hacker ne peut pas entrer" },
      { quoi: "Ne jamais réutiliser un mot de passe", comment: "Utiliser un gestionnaire comme Bitwarden ou 1Password pour des mots de passe uniques", impact: "Une fuite sur un site ne compromet pas tous les autres" },
      { quoi: "Changer les mots de passe par défaut", comment: "Router, base de données, panneau admin : tous changés immédiatement", impact: "Les hackers testent en premier les identifiants par défaut" }
    ]
  },
  {
    id: "mises-jour",
    icon: "🔄",
    titre: "Mises à jour & Logiciels",
    risque: "ÉLEVÉ",
    couleurRisque: "#ff7f27",
    actions: [
      { quoi: "Mettre à jour tous les logiciels régulièrement", comment: "CMS, plugins, thèmes, bibliothèques npm/pip : chaque mise à jour corrige des failles", impact: "La majorité des piratages exploitent des failles déjà corrigées" },
      { quoi: "Supprimer les plugins et extensions inutilisés", comment: "Chaque plugin inactif est une porte d'entrée potentielle. Si on l'utilise plus, on l'efface", impact: "Réduit la surface d'attaque de la plateforme" },
      { quoi: "Activer les mises à jour automatiques de sécurité", comment: "Au minimum pour le système d'exploitation et les correctifs critiques", impact: "Les failles critiques sont corrigées en heures plutôt qu'en semaines" },
      { quoi: "Utiliser uniquement des logiciels officiels et légitimes", comment: "Éviter les versions piratées — elles contiennent souvent des malwares cachés", impact: "Élimine le risque d'infection volontaire par le logiciel lui-même" }
    ]
  },
  {
    id: "sauvegarde",
    icon: "💾",
    titre: "Sauvegardes & Récupération",
    risque: "ÉLEVÉ",
    couleurRisque: "#ff7f27",
    actions: [
      { quoi: "Sauvegarder les données tous les jours", comment: "Automatiser une sauvegarde quotidienne vers un emplacement séparé (S3, Backblaze)", impact: "En cas de ransomware, on restaure sans payer" },
      { quoi: "Appliquer la règle 3-2-1", comment: "3 copies, 2 supports différents, 1 hors site (cloud + disque externe + serveur distant)", impact: "Aucun sinistre ne peut effacer toutes les copies" },
      { quoi: "Tester les sauvegardes régulièrement", comment: "Une sauvegarde non testée = inutile. Test de restauration une fois par mois", impact: "On sait si la récupération va fonctionner avant d'en avoir besoin" },
      { quoi: "Séparer le stockage des sauvegardes du serveur principal", comment: "Si la sauvegarde est sur le même serveur, un pirate efface les deux en même temps", impact: "Les sauvegardes restent intactes même si le serveur est compromis" }
    ]
  },
  {
    id: "reseau",
    icon: "🌐",
    titre: "Réseau & Connexions",
    risque: "ÉLEVÉ",
    couleurRisque: "#ff7f27",
    actions: [
      { quoi: "Utiliser HTTPS partout (certificat SSL/TLS)", comment: "Installer Let's Encrypt (gratuit) et forcer la redirection HTTP → HTTPS", impact: "Toutes les données transmises sont chiffrées, impossibles à intercepter" },
      { quoi: "Ne jamais utiliser le Wi-Fi public sans VPN", comment: "Utiliser ProtonVPN ou Mullvad si on travaille hors du réseau sécurisé", impact: "Empêche l'interception des identifiants sur des réseaux non sécurisés" },
      { quoi: "Configurer un pare-feu (Firewall)", comment: "Bloquer tous les ports inutilisés. N'ouvrir que 80, 443, 22 si SSH", impact: "Réduit drastiquement les vecteurs d'attaque réseau" },
      { quoi: "Limiter l'accès SSH par clé uniquement", comment: "Désactiver l'authentification SSH par mot de passe. Utiliser des clés ed25519", impact: "Rend l'accès serveur impossible sans la clé physique" }
    ]
  },
  {
    id: "permissions",
    icon: "🛡️",
    titre: "Permissions & Comptes",
    risque: "MODÉRÉ",
    couleurRisque: "#ffcf4a",
    actions: [
      { quoi: "Principe du moindre privilège", comment: "Chaque utilisateur reçoit uniquement les droits dont il a besoin", impact: "Un compte compromis cause des dégâts limités" },
      { quoi: "Supprimer les comptes inactifs", comment: "Anciens employés, comptes de test, accès temporaires : supprimer dès que c'est terminé", impact: "Élimine des portes d'entrée oubliées mais exploitables" },
      { quoi: "Surveiller les connexions suspectes", comment: "Alertes pour connexions depuis pays inconnus, heures inhabituelles, ou après échecs répétés", impact: "Détection rapide d'une tentative d'intrusion" },
      { quoi: "Séparer les comptes admin des comptes utilisateurs", comment: "Ne pas utiliser le compte admin pour les tâches quotidiennes", impact: "Une erreur sur le compte normal n'expose pas les droits admin" }
    ]
  },
  {
    id: "phishing",
    icon: "🎣",
    titre: "Phishing & Ingénierie sociale",
    risque: "CRITIQUE",
    couleurRisque: "#ff3b3b",
    actions: [
      { quoi: "Ne jamais cliquer sur des liens dans des courriels non sollicités", comment: "Aller directement sur le site en tapant l'adresse dans le navigateur", impact: "Évite 95 % des tentatives de vol d'identifiants par phishing" },
      { quoi: "Vérifier l'expéditeur réel d'un courriel", comment: "Un courriel peut sembler venir de Google mais venir de google@arnaques.ru", impact: "Déjoue les usurpations d'identité par courriel" },
      { quoi: "Former les membres de l'équipe aux tentatives de phishing", comment: "Une seule personne clique sur le mauvais lien = plateforme compromise", impact: "L'humain est le maillon le plus souvent exploité" },
      { quoi: "Mettre en place SPF, DKIM et DMARC sur le domaine", comment: "Ces enregistrements DNS empêchent l'envoi de courriels frauduleux en votre nom", impact: "Vos clients ne reçoivent pas de faux courriels signés à votre nom" }
    ]
  },
  {
    id: "code",
    icon: "💻",
    titre: "Sécurité du code & Applications",
    risque: "ÉLEVÉ",
    couleurRisque: "#ff7f27",
    actions: [
      { quoi: "Valider et filtrer toutes les entrées utilisateurs", comment: "Ne jamais faire confiance à ce qu'un utilisateur envoie. Valider côté serveur", impact: "Bloque les injections SQL, XSS, et autres injections de code" },
      { quoi: "Ne jamais stocker les mots de passe en clair", comment: "Toujours hacher avec bcrypt, argon2 ou scrypt", impact: "Même en cas de fuite, les mots de passe restent inutilisables" },
      { quoi: "Utiliser des variables d'environnement pour les secrets", comment: "Jamais de clés API ou tokens dans le code source ou sur GitHub", impact: "Évite d'exposer des accès critiques dans des dépôts publics" },
      { quoi: "Limiter les tentatives de connexion (rate limiting)", comment: "Après 5 tentatives échouées, bloquer l'IP. Utiliser Supabase RLS ou Cloudflare", impact: "Rend les attaques par force brute impraticables" }
    ]
  },
  {
    id: "surveillance",
    icon: "👁️",
    titre: "Surveillance & Détection",
    risque: "MODÉRÉ",
    couleurRisque: "#ffcf4a",
    actions: [
      { quoi: "Activer et lire les journaux (logs) régulièrement", comment: "Surveiller les logs d'accès, d'erreurs et d'authentification", impact: "Détection précoce d'une intrusion avant qu'elle cause des dégâts" },
      { quoi: "Configurer des alertes automatiques", comment: "Être notifié si le site tombe, connexion admin inhabituelle, ou CPU anormal", impact: "Réduction du temps de réaction face à une attaque" },
      { quoi: "Surveiller le dark web pour ses données", comment: "Utiliser Have I Been Pwned pour détecter si des données ont été publiées", impact: "On sait rapidement si des identifiants ont été compromis" },
      { quoi: "Faire des tests de pénétration réguliers", comment: "Une fois par an minimum, faire tester la plateforme par un expert (pentest)", impact: "On corrige les vulnérabilités avant qu'elles soient exploitées" }
    ]
  }
];

var SCAN_TYPE_MAP = {
  "reconnaissance-passive": ["reseau", "phishing", "surveillance"],
  "passive_recon":          ["reseau", "phishing", "surveillance"],
  "scan-web":               ["reseau", "code", "mises-jour"],
  "web_scan":               ["reseau", "code", "mises-jour"],
  "audit-configuration":    ["mots-passe", "mises-jour", "sauvegarde", "permissions"],
  "config_audit":           ["mots-passe", "mises-jour", "sauvegarde", "permissions"],
  "vulnerabilites":         ["mots-passe", "reseau", "code", "surveillance"],
  "vuln_scan":              ["mots-passe", "reseau", "code", "surveillance"],
  "dark-web":               ["phishing", "surveillance", "mots-passe"],
  "dark_web_monitor":       ["phishing", "surveillance", "mots-passe"],
  "darkweb":                ["phishing", "surveillance", "mots-passe"],
  "hibp":                   ["mots-passe", "phishing", "surveillance"],
  "osint":                  ["reseau", "phishing", "surveillance", "permissions"],
  "courriel_scan":          ["phishing", "reseau", "surveillance"],
  "surface_scan":           ["reseau", "code", "permissions", "surveillance"],
  "actif_scan":             ["permissions", "reseau", "code", "mises-jour"],
  "personnalise":           ["mots-passe", "mises-jour", "sauvegarde", "reseau", "permissions", "phishing", "code", "surveillance"],
  "audit-complet":          ["mots-passe", "mises-jour", "sauvegarde", "reseau", "permissions", "phishing", "code", "surveillance"],
  "full_audit":             ["mots-passe", "mises-jour", "sauvegarde", "reseau", "permissions", "phishing", "code", "surveillance"]
};

var _gpChecks = {};
var _gpSectionOuverte = null;

async function gpSauvegarderProgression() {
  try {
    var u = await supabase.auth.getUser();
    if (!u.data || !u.data.user) return;
    await supabase.from('protection_progress').upsert({
      user_id: u.data.user.id,
      checks: _gpChecks,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch (err) {
    console.error('[guide-protection] sauvegarde:', err);
  }
}

async function gpChargerProgression() {
  try {
    var u = await supabase.auth.getUser();
    if (!u.data || !u.data.user) return;
    var res = await supabase.from('protection_progress').select('checks').eq('user_id', u.data.user.id).single();
    if (res.data && res.data.checks) _gpChecks = res.data.checks;
  } catch (err) {}
}

function gpCalculerScore() {
  var total = CATEGORIES_PROTECTION.reduce(function(s, c) { return s + c.actions.length; }, 0);
  var cochees = Object.values(_gpChecks).filter(Boolean).length;
  var pct = Math.round((cochees / total) * 100);
  return { total: total, cochees: cochees, pct: pct };
}

function gpCouleurScore(pct) {
  if (pct < 30) return "#ff3b3b";
  if (pct < 60) return "#ff7f27";
  if (pct < 85) return "#ffcf4a";
  return "#37e0a0";
}

function gpLabelScore(pct) {
  if (pct < 30) return "⚠ VULNÉRABLE";
  if (pct < 60) return "⚡ À RENFORCER";
  if (pct < 85) return "✔ BON NIVEAU";
  return "✦ BIEN PROTÉGÉ";
}

function gpMettreAJourScore() {
  var s = gpCalculerScore();
  var c = gpCouleurScore(s.pct);
  var elPct = document.getElementById('gp-score-pct');
  var elBarre = document.getElementById('gp-score-barre');
  var elLabel = document.getElementById('gp-score-label');
  var elCercle = document.getElementById('gp-score-cercle');
  var elCompteur = document.getElementById('gp-score-compteur');
  if (elPct) { elPct.textContent = s.pct + '%'; elPct.style.color = c; }
  if (elBarre) { elBarre.style.width = s.pct + '%'; elBarre.style.background = c; }
  if (elLabel) { elLabel.textContent = gpLabelScore(s.pct); elLabel.style.color = c; }
  if (elCercle) elCercle.style.borderColor = c;
  if (elCompteur) elCompteur.textContent = s.cochees + ' / ' + s.total + ' mesures appliquées';
}

function gpToggleSection(id) {
  _gpSectionOuverte = _gpSectionOuverte === id ? null : id;
  CATEGORIES_PROTECTION.forEach(function(cat) {
    var contenu = document.getElementById('gp-contenu-' + cat.id);
    var header = document.getElementById('gp-header-' + cat.id);
    var fleche = document.getElementById('gp-fleche-' + cat.id);
    if (!contenu) return;
    if (cat.id === _gpSectionOuverte) {
      contenu.style.display = 'block';
      if (header) { header.style.borderColor = cat.couleurRisque; header.style.borderRadius = '10px 10px 0 0'; header.style.background = '#161616'; }
      if (fleche) fleche.textContent = '▲';
    } else {
      contenu.style.display = 'none';
      if (header) { header.style.borderColor = '#23232c'; header.style.borderRadius = '10px'; header.style.background = '#111'; }
      if (fleche) fleche.textContent = '▼';
    }
  });
}

function gpToggleCheck(catId, actionIdx) {
  var key = catId + '-' + actionIdx;
  _gpChecks[key] = !_gpChecks[key];
  var btn = document.getElementById('gp-check-' + key);
  var row = document.getElementById('gp-row-' + key);
  var titre = document.getElementById('gp-titre-' + key);
  if (btn) {
    btn.textContent = _gpChecks[key] ? '✓' : '';
    btn.style.borderColor = _gpChecks[key] ? '#37e0a0' : '#333';
    btn.style.background = _gpChecks[key] ? 'rgba(55,224,160,0.15)' : 'transparent';
  }
  if (row) row.style.background = _gpChecks[key] ? 'rgba(55,224,160,0.04)' : 'transparent';
  if (titre) {
    titre.style.color = _gpChecks[key] ? '#37e0a0' : '#fff';
    titre.style.textDecoration = _gpChecks[key] ? 'line-through' : 'none';
    titre.style.opacity = _gpChecks[key] ? '0.7' : '1';
  }
  var cat = CATEGORIES_PROTECTION.find(function(c) { return c.id === catId; });
  if (cat) {
    var cocheesCat = cat.actions.filter(function(_, i) { return _gpChecks[catId + '-' + i]; }).length;
    var elC = document.getElementById('gp-compteur-' + catId);
    if (elC) elC.textContent = cocheesCat + '/' + cat.actions.length + ' appliquées';
  }
  gpMettreAJourScore();
  clearTimeout(window._gpSaveTimeout);
  window._gpSaveTimeout = setTimeout(gpSauvegarderProgression, 1500);
}

function gpOuvrirChatSilex() {
  var tab = document.getElementById('silex-tab-scan');
  if (tab) { tab.click(); return; }
  var chat = document.getElementById('chat-in');
  if (chat) { chat.focus(); return; }
}

async function renderGuideProtection(scanType, conteneurId) {
  var conteneur = document.getElementById(conteneurId);
  if (!conteneur) return;

  await gpChargerProgression();

  var idsAfficher = SCAN_TYPE_MAP[scanType] || CATEGORIES_PROTECTION.map(function(c) { return c.id; });
  var categories = CATEGORIES_PROTECTION.filter(function(c) { return idsAfficher.indexOf(c.id) !== -1; });

  var niveauxCouleur = {
    "CRITIQUE": { couleur: "#ff3b3b", bg: "rgba(255,59,59,0.10)" },
    "ÉLEVÉ":    { couleur: "#ff7f27", bg: "rgba(255,127,39,0.10)" },
    "MODÉRÉ":   { couleur: "#ffcf4a", bg: "rgba(255,207,74,0.10)" }
  };

  var s = gpCalculerScore();
  var scoreC = gpCouleurScore(s.pct);
  var scanLabel = (scanType || 'audit-complet').replace(/-/g, ' ').replace(/_/g, ' ').toUpperCase();

  var catsHtml = categories.map(function(cat) {
    var niv = niveauxCouleur[cat.risque] || niveauxCouleur["MODÉRÉ"];
    var cocheesCat = cat.actions.filter(function(_, i) { return _gpChecks[cat.id + '-' + i]; }).length;

    var actionsHtml = cat.actions.map(function(action, idx) {
      var key = cat.id + '-' + idx;
      var checked = !!_gpChecks[key];
      return '<div id="gp-row-' + key + '" style="padding:14px 18px;border-bottom:' + (idx < cat.actions.length - 1 ? '1px solid #1a1a1a' : 'none') + ';display:flex;gap:12px;align-items:flex-start;background:' + (checked ? 'rgba(55,224,160,0.04)' : 'transparent') + ';transition:background 0.2s;">' +
        '<button id="gp-check-' + key + '" onclick="gpToggleCheck(\'' + cat.id + '\',' + idx + ')" style="width:22px;height:22px;border-radius:5px;border:2px solid ' + (checked ? '#37e0a0' : '#333') + ';background:' + (checked ? 'rgba(55,224,160,0.15)' : 'transparent') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;font-size:13px;color:#37e0a0;transition:all 0.2s;font-family:monospace;">' + (checked ? '✓' : '') + '</button>' +
        '<div style="flex:1;">' +
          '<div id="gp-titre-' + key + '" style="color:' + (checked ? '#37e0a0' : '#fff') + ';font-weight:bold;font-size:12px;margin-bottom:5px;text-decoration:' + (checked ? 'line-through' : 'none') + ';opacity:' + (checked ? '0.7' : '1') + ';letter-spacing:0.5px;">' + action.quoi + '</div>' +
          '<div style="color:#777;font-size:12px;line-height:1.6;margin-bottom:8px;">' + action.comment + '</div>' +
          '<div style="background:rgba(255,207,74,0.07);border:1px solid rgba(255,207,74,0.2);border-radius:6px;padding:6px 10px;font-size:11px;color:#ffcf4a;display:flex;gap:6px;align-items:flex-start;"><span>💡</span><span>' + action.impact + '</span></div>' +
        '</div></div>';
    }).join('');

    return '<div>' +
      '<div id="gp-header-' + cat.id + '" onclick="gpToggleSection(\'' + cat.id + '\')" style="background:#111;border:1px solid #23232c;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:all 0.2s;">' +
        '<span style="font-size:20px;">' + cat.icon + '</span>' +
        '<div style="flex:1;"><div style="color:#fff;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:2px;">' + cat.titre + '</div>' +
        '<div id="gp-compteur-' + cat.id + '" style="font-size:11px;color:#555;">' + cocheesCat + '/' + cat.actions.length + ' appliquées</div></div>' +
        '<div style="background:' + niv.bg + ';border:1px solid ' + niv.couleur + ';color:' + niv.couleur + ';font-size:10px;font-weight:bold;letter-spacing:2px;padding:3px 8px;border-radius:4px;">' + cat.risque + '</div>' +
        '<span id="gp-fleche-' + cat.id + '" style="color:#555;margin-left:8px;font-size:12px;">▼</span>' +
      '</div>' +
      '<div id="gp-contenu-' + cat.id + '" style="display:none;background:#0f0f0f;border:1px solid ' + cat.couleurRisque + ';border-top:none;border-radius:0 0 10px 10px;overflow:hidden;">' +
        actionsHtml +
      '</div></div>';
  }).join('');

  conteneur.innerHTML =
    '<div style="background:#0a0a0a;border:1px solid #23232c;border-radius:12px;overflow:hidden;margin-top:20px;font-family:\'Share Tech Mono\',\'Courier New\',monospace;">' +
      '<div style="background:#0d0d0d;border-bottom:2px solid #ff7f27;padding:16px 20px;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:22px;">🛡️</span>' +
        '<div><div style="color:#ff7f27;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:2px;">RAPPORT DE PROTECTION — ' + scanLabel + '</div>' +
        '<div style="color:#fff;font-weight:bold;font-size:16px;letter-spacing:1px;">QUOI CORRIGER POUR TE PROTÉGER</div></div>' +
      '</div>' +
      '<div style="margin:20px;background:#111;border:2px solid ' + scoreC + ';border-radius:12px;padding:18px 20px;display:flex;align-items:center;gap:20px;">' +
        '<div id="gp-score-cercle" style="width:72px;height:72px;border-radius:50%;border:4px solid ' + scoreC + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;flex-direction:column;">' +
          '<span id="gp-score-pct" style="font-size:20px;font-weight:bold;color:' + scoreC + ';">' + s.pct + '%</span>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="color:#aaa;font-size:10px;letter-spacing:2px;margin-bottom:6px;">NIVEAU DE PROTECTION</div>' +
          '<div style="background:#1a1a1a;border-radius:4px;height:7px;margin-bottom:8px;overflow:hidden;">' +
            '<div id="gp-score-barre" style="background:' + scoreC + ';width:' + s.pct + '%;height:100%;transition:width 0.4s ease;border-radius:4px;"></div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
            '<span id="gp-score-compteur" style="color:#666;font-size:12px;">' + s.cochees + ' / ' + s.total + ' mesures appliquées</span>' +
            '<span id="gp-score-label" style="color:' + scoreC + ';font-size:11px;font-weight:bold;">' + gpLabelScore(s.pct) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin:0 20px 20px;background:rgba(255,127,39,0.05);border:1px solid rgba(255,127,39,0.2);border-radius:8px;padding:12px 16px;">' +
        '<p style="margin:0;color:#aaa;font-size:12px;line-height:1.7;">⚡ Coche les mesures déjà appliquées. Commence par les <span style="color:#ff3b3b;font-weight:bold;">CRITIQUE</span>, ensuite <span style="color:#ff7f27;font-weight:bold;">ÉLEVÉ</span>, puis <span style="color:#ffcf4a;font-weight:bold;">MODÉRÉ</span>. Ta progression est sauvegardée automatiquement.</p>' +
      '</div>' +
      '<div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:10px;">' +
        catsHtml +
      '</div>' +
      '<div style="padding:0 20px 24px;text-align:center;">' +
        '<button onclick="gpOuvrirChatSilex()" style="background:#ff7f27;color:#000;border:none;border-radius:8px;padding:14px 32px;font-size:13px;font-weight:bold;letter-spacing:2px;cursor:pointer;font-family:\'Share Tech Mono\',monospace;box-shadow:0 0 18px rgba(255,127,39,0.35);transition:box-shadow 0.2s,transform 0.1s;">🤖 DEMANDER À TI-LEX IA DE M\'AIDER</button>' +
        '<div style="margin-top:14px;color:#333;font-size:10px;letter-spacing:2px;">TI-LEX-AL · PRODUIT DU QUÉBEC · ti-lex.ca</div>' +
      '</div>' +
    '</div>';

  console.log('[ti-lex] Guide de protection rendu ✓ (' + categories.length + ' catégories)');
}

async function onScanTermine(typeScan) {
  var conteneur = document.getElementById('guide-protection-result');
  if (!conteneur) return;
  conteneur.style.display = 'block';
  await renderGuideProtection(typeScan, 'guide-protection-result');
  setTimeout(function() {
    conteneur.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}
