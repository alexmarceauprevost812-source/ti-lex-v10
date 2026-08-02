/* ══════════════════════════════════════════════════════════════════════════
   ti-lex v10 — CATALOGUE DES MOTEURS DE CYBERSÉCURITÉ (côté interface)
   ---------------------------------------------------------------------------
   Miroir de supabase/functions/_shared/moteurs-cyber.ts : mêmes identifiants,
   mêmes catégories. Sert à construire le sélecteur SILEX sans aller-retour
   réseau. `MoteursCyber.rafraichir()` resynchronise depuis le serveur (source
   de vérité) quand la session admin est disponible.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CATEGORIES = [
    { id: "recon",      nom: "Reconnaissance DNS",    icone: "🛰️" },
    { id: "courriel",   nom: "Sécurité du courriel",  icone: "✉️" },
    { id: "web",        nom: "Surface web",           icone: "🌐" },
    { id: "exposition", nom: "Exposition publique",   icone: "🔦" },
    { id: "actif",      nom: "Sondage actif léger",   icone: "⚡" },
    { id: "posture",    nom: "Posture interne",       icone: "🗄️" },
    { id: "fuites",     nom: "Fuites de données",     icone: "🌑" }
  ];

  /* invasivite : passif | actif-leger — besoin : reseau | base | cle */
  var MOTEURS = [
    /* ── Reconnaissance DNS ────────────────────────────────────────────── */
    { id: "dns",                 nom: "Empreinte DNS",                  categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Inventaire réel des enregistrements A/AAAA/NS/MX/TXT/CNAME via DNS-over-HTTPS." },
    { id: "dnssec",              nom: "DNSSEC",                         categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 5,  description: "Vérifie la présence d'enregistrements DS et la validation DNSSEC du résolveur." },
    { id: "caa",                 nom: "Enregistrements CAA",            categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 4,  description: "Vérifie quelles autorités de certification peuvent émettre pour le domaine." },
    { id: "dns_inverse",         nom: "DNS inverse et hébergeur",       categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 6,  description: "Résolution PTR des adresses IP pour identifier l'hébergeur réel." },
    { id: "sous_domaines",       nom: "Énumération de sous-domaines",   categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 30, description: "Sous-domaines réels issus des journaux de transparence des certificats, puis résolus par DNS." },
    { id: "certificats",         nom: "Certificats TLS émis",           categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 15, description: "Analyse des certificats réellement émis (autorités, expiration, jokers) via crt.sh." },
    { id: "takeover",            nom: "Détournement de sous-domaine",   categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 25, description: "Détecte les CNAME pendants vers des services SaaS libérés (subdomain takeover)." },
    { id: "typosquat",           nom: "Domaines jumeaux",               categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 20, description: "Génère des variantes typographiques du domaine et vérifie lesquelles sont enregistrées." },
    { id: "reputation",          nom: "Listes de blocage",              categorie: "recon",      invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Interroge les listes de réputation Spamhaus (DBL domaine, ZEN adresse IP)." },

    /* ── Sécurité du courriel ──────────────────────────────────────────── */
    { id: "courriel_auth",       nom: "SPF · DKIM · DMARC",             categorie: "courriel",   invasivite: "passif",      besoin: "reseau", duree: 12, description: "Vérifie l'authentification du courriel : SPF (et ses limites), sélecteurs DKIM, politique DMARC." },
    { id: "courriel_transport",  nom: "MTA-STS · TLS-RPT · BIMI",       categorie: "courriel",   invasivite: "passif",      besoin: "reseau", duree: 10, description: "Vérifie le chiffrement imposé du transport courriel et la déclaration de marque." },

    /* ── Surface web ───────────────────────────────────────────────────── */
    { id: "entetes",             nom: "En-têtes de sécurité HTTP",      categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 10, description: "Lit les en-têtes réels renvoyés par la cible et analyse la qualité de chaque politique." },
    { id: "tls",                 nom: "TLS et redirection HTTPS",       categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 12, description: "Vrai handshake TLS, vérification de la redirection HTTP→HTTPS et du préchargement HSTS." },
    { id: "cors",                nom: "Politique CORS",                 categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Envoie une origine piégée et observe si le serveur la reflète." },
    { id: "temoins",             nom: "Témoins (cookies)",              categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Analyse les attributs Secure, HttpOnly et SameSite des témoins réellement déposés." },
    { id: "methodes_http",       nom: "Méthodes HTTP autorisées",       categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 6,  description: "Requête OPTIONS pour lister les méthodes réellement acceptées par le serveur." },
    { id: "robots",              nom: "robots.txt et plan de site",     categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Lit robots.txt et sitemap.xml, et repère les chemins sensibles qu'ils divulguent." },
    { id: "security_txt",        nom: "security.txt (RFC 9116)",        categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 6,  description: "Vérifie la présence et la validité du canal de divulgation responsable." },
    { id: "technologies",        nom: "Empreinte technologique",        categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 10, description: "Identifie serveur, cadriciel et CMS à partir des en-têtes et du HTML réellement servis." },
    { id: "contenu_mixte",       nom: "Contenu mixte et formulaires",   categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Repère les ressources chargées en HTTP et les formulaires qui postent en clair." },
    { id: "sri",                 nom: "Intégrité des ressources tierces", categorie: "web",      invasivite: "passif",      besoin: "reseau", duree: 8,  description: "Vérifie l'attribut integrity sur les scripts tiers et inventorie les origines externes." },
    { id: "loi25",               nom: "Vie privée et Loi 25",           categorie: "web",        invasivite: "passif",      besoin: "reseau", duree: 12, description: "Vérifie politique de confidentialité, bandeau de consentement et traceurs tiers réellement chargés." },

    /* ── Exposition publique ───────────────────────────────────────────── */
    { id: "secrets_client",      nom: "Secrets exposés côté client",    categorie: "exposition", invasivite: "passif",      besoin: "reseau", duree: 20, description: "Télécharge le HTML et les bundles JS servis, puis y cherche des clés d'API réelles." },
    { id: "archives",            nom: "Archives web",                   categorie: "exposition", invasivite: "passif",      besoin: "reseau", duree: 18, description: "Interroge la Wayback Machine pour repérer des chemins sensibles archivés publiquement." },

    /* ── Sondage actif léger (autorisation requise) ────────────────────── */
    { id: "fichiers_exposes",    nom: "Fichiers sensibles exposés",     categorie: "actif",      invasivite: "actif-leger", besoin: "reseau", duree: 25, description: "Teste des chemins connus (.env, .git, sauvegardes) et confirme par signature de contenu." },
    { id: "panneaux_admin",      nom: "Interfaces d'administration",    categorie: "actif",      invasivite: "actif-leger", besoin: "reseau", duree: 20, description: "Recherche des consoles d'administration et des points d'API de diagnostic exposés." },
    { id: "ports_web",           nom: "Ports applicatifs HTTP",         categorie: "actif",      invasivite: "actif-leger", besoin: "reseau", duree: 30, description: "Sonde les ports HTTP/HTTPS courants hors 80/443 (limite honnête : pas de sockets bruts)." },
    { id: "services_donnees",    nom: "Services de données exposés",    categorie: "actif",      invasivite: "actif-leger", besoin: "reseau", duree: 25, description: "Vérifie si Elasticsearch, Kibana, CouchDB, Grafana ou l'API Docker répondent sans authentification." },
    { id: "redirection_ouverte", nom: "Redirection ouverte",            categorie: "actif",      invasivite: "actif-leger", besoin: "reseau", duree: 20, description: "Teste les paramètres de redirection courants avec une destination témoin." },

    /* ── Posture interne (base ti-lex) ─────────────────────────────────── */
    { id: "rls",                 nom: "Row Level Security",             categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 6,  description: "Lit le catalogue PostgreSQL pour vérifier que RLS est actif sur chaque table publique." },
    { id: "politiques_rls",      nom: "Politiques RLS",                 categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 6,  description: "Détecte les tables où RLS est actif mais où aucune politique n'est définie." },
    { id: "anon_exposition",     nom: "Test d'exposition anonyme",      categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 30, description: "Tente réellement de lire chaque table publique avec la clé anon : preuve directe de l'efficacité de RLS." },
    { id: "buckets",             nom: "Buckets de stockage",            categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 5,  description: "Liste les buckets Supabase Storage et signale ceux marqués publics." },
    { id: "fonctions_exposees",  nom: "Fonctions SQL exposées",         categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 6,  description: "Repère les fonctions PostgreSQL exécutables par le rôle anon, surtout en SECURITY DEFINER." },
    { id: "extensions",          nom: "Extensions PostgreSQL",          categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 4,  description: "Vérifie qu'aucune extension n'est installée dans le schéma public (recommandation Supabase)." },
    { id: "comptes_auth",        nom: "Hygiène des comptes",            categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 5,  description: "Agrégats réels sur l'authentification : MFA, courriels non confirmés, comptes dormants." },
    { id: "journalisation",      nom: "Journalisation d'audit",         categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 4,  description: "Vérifie que la table d'audit reçoit réellement des événements récents." },
    { id: "limitation_debit",    nom: "Limitation de débit",            categorie: "posture",    invasivite: "passif",      besoin: "base",   duree: 5,  description: "Vérifie que l'infrastructure de rate limiting existe et fonctionne réellement." },

    /* ── Fuites de données ─────────────────────────────────────────────── */
    { id: "hibp",                nom: "Brèches de données (HIBP)",      categorie: "fuites",     invasivite: "passif",      besoin: "reseau", duree: 12, description: "Interroge réellement Have I Been Pwned pour le domaine ou l'adresse ciblée." },
    { id: "portee_externe",      nom: "Limites honnêtes du moteur",     categorie: "fuites",     invasivite: "passif",      besoin: "reseau", duree: 1,  description: "Déclare explicitement ce qu'une Edge Function ne peut pas faire, plutôt que de le simuler." }
  ];

  var PROFILS = [
    { id: "passive_recon",    nom: "Reconnaissance passive",          icone: "🔍", moteurs: ["dns", "dnssec", "caa", "dns_inverse", "tls", "certificats", "technologies", "reputation"] },
    { id: "web_scan",         nom: "Scan web",                        icone: "🌐", moteurs: ["entetes", "tls", "cors", "temoins", "methodes_http", "robots", "security_txt", "technologies", "contenu_mixte", "sri", "secrets_client"] },
    { id: "courriel_scan",    nom: "Sécurité du courriel",            icone: "✉️", moteurs: ["courriel_auth", "courriel_transport", "reputation", "typosquat", "dns"] },
    { id: "surface_scan",     nom: "Surface d'attaque",               icone: "🛰️", moteurs: ["dns", "sous_domaines", "certificats", "takeover", "typosquat", "archives", "technologies"] },
    { id: "config_audit",     nom: "Audit de configuration",          icone: "⚙️", moteurs: ["rls", "politiques_rls", "anon_exposition", "buckets", "fonctions_exposees", "extensions", "comptes_auth", "journalisation", "limitation_debit"] },
    { id: "vuln_scan",        nom: "Vulnérabilités",                  icone: "🛡️", moteurs: ["entetes", "cors", "temoins", "methodes_http", "contenu_mixte", "sri", "secrets_client", "takeover", "limitation_debit", "portee_externe"] },
    { id: "actif_scan",       nom: "Sondage actif léger",             icone: "⚡", moteurs: ["fichiers_exposes", "panneaux_admin", "ports_web", "services_donnees", "redirection_ouverte"] },
    { id: "dark_web_monitor", nom: "Fuites et exposition publique",   icone: "🌑", moteurs: ["hibp", "secrets_client", "archives", "typosquat", "portee_externe"] },
    { id: "full_audit",       nom: "Audit complet",                   icone: "🔰", moteurs: MOTEURS.map(function (m) { return m.id; }) }
  ];

  function parId(id) {
    for (var i = 0; i < MOTEURS.length; i++) if (MOTEURS[i].id === id) return MOTEURS[i];
    return null;
  }

  function profilParId(id) {
    for (var i = 0; i < PROFILS.length; i++) if (PROFILS[i].id === id) return PROFILS[i];
    return null;
  }

  function categorieParId(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return { id: id, nom: id, icone: "•" };
  }

  function deCategorie(cat) {
    return MOTEURS.filter(function (m) { return m.categorie === cat; });
  }

  /** Durée estimée d'une sélection : les moteurs tournent 5 à la fois. */
  function dureeEstimee(ids) {
    var total = 0;
    ids.forEach(function (id) {
      var m = parId(id);
      if (m) total += m.duree;
    });
    return Math.max(8, Math.round(total / 5));
  }

  function formaterDuree(secondes) {
    if (secondes < 60) return "~" + secondes + " s";
    var m = Math.floor(secondes / 60);
    var s = secondes % 60;
    return "~" + m + " min" + (s > 0 ? " " + s : "");
  }

  /**
   * Resynchronise le catalogue depuis l'Edge Function (source de vérité).
   * `appel` doit être une fonction qui poste {action:'catalogue'} et renvoie la réponse JSON.
   */
  async function rafraichir(appel) {
    try {
      var data = await appel({ action: "catalogue" });
      if (!data || !Array.isArray(data.moteurs) || data.moteurs.length === 0) return false;
      MOTEURS.length = 0;
      data.moteurs.forEach(function (m) { MOTEURS.push(m); });
      if (Array.isArray(data.categories) && data.categories.length) {
        CATEGORIES.length = 0;
        data.categories.forEach(function (c) { CATEGORIES.push(c); });
      }
      if (Array.isArray(data.profils) && data.profils.length) {
        var icones = {};
        PROFILS.forEach(function (p) { icones[p.id] = p.icone; });
        PROFILS.length = 0;
        data.profils.forEach(function (p) {
          PROFILS.push({ id: p.id, nom: p.nom, icone: icones[p.id] || "🔰", moteurs: p.moteurs });
        });
      }
      return true;
    } catch (e) {
      console.warn("[moteurs-cyber] catalogue serveur indisponible, catalogue local conservé :", e.message);
      return false;
    }
  }

  global.MoteursCyber = {
    CATEGORIES: CATEGORIES,
    MOTEURS: MOTEURS,
    PROFILS: PROFILS,
    parId: parId,
    profilParId: profilParId,
    categorieParId: categorieParId,
    deCategorie: deCategorie,
    dureeEstimee: dureeEstimee,
    formaterDuree: formaterDuree,
    rafraichir: rafraichir
  };
})(window);
