/* ============================================================
   ti-lex-AL v10 — js/tilex-sentinelle.js
   Sentinelle 25 — moteur de scan de données sensibles (Loi 25 QC),
   porté en JavaScript pur pour rouler 100 % dans le NAVIGATEUR.

   Pourquoi côté client : un outil qui traite des fichiers sensibles
   ne doit jamais les envoyer au serveur. Ici, tout le scan se fait
   localement — les fichiers ne quittent JAMAIS le poste de l'usager.

   ⚠️ INVARIANT NUMÉRO 1 (identique au moteur Python d'origine) :
   Aucune donnée sensible n'apparaît jamais en clair dans une sortie.
   Toute valeur détectée est masquée (ex. « xxx xxx xxx »). Le contexte
   d'une ligne est masqué par POSITION (union des spans de tous les
   motifs), ce qui évite qu'une valeur voisine — ou une valeur qui
   ressemble à une donnée sensible mais échoue la validation — fuie.

   Style ti-lex : vanilla JS, aucun import/export, global sur window,
   try/catch, anti-XSS (textContent partout au rendu).
   ============================================================ */
(function () {
  "use strict";

  // ---------------------------------------------------------------
  //  Config
  // ---------------------------------------------------------------
  var TAILLE_MAX_MO = 20;
  var EXT_BINAIRES = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
    ".mp3", ".mp4", ".mov", ".avi", ".mkv", ".wav", ".flac",
    ".zip", ".gz", ".tar", ".rar", ".7z", ".bz2",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".o", ".a",
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ]);
  var GRAVITES = { CRITIQUE: 4, ELEVE: 3, MOYEN: 2, FAIBLE: 1 };

  // ---------------------------------------------------------------
  //  1) VALIDATEURS (réduisent les faux positifs)
  // ---------------------------------------------------------------
  function chiffres(s) { return String(s).replace(/\D/g, ""); }

  function luhnValide(valeur) {
    var ch = chiffres(valeur);
    if (ch.length < 2) return false;
    var total = 0, pair = false;
    for (var i = ch.length - 1; i >= 0; i--) {
      var n = ch.charCodeAt(i) - 48;
      if (pair) { n *= 2; if (n > 9) n -= 9; }
      total += n; pair = !pair;
    }
    return total % 10 === 0;
  }

  function nasValide(valeur) {
    var ch = chiffres(valeur);
    if (ch.length !== 9) return false;
    if (ch[0] === "0" || ch[0] === "8") return false;
    if (new Set(ch.split("")).size === 1) return false;
    return luhnValide(ch);
  }

  function namValide(valeur) {
    var v = String(valeur).trim();
    if (!/^[A-Za-z]{4}[ \-]?\d{4}[ \-]?\d{4}$/.test(v)) return false;
    var ch = chiffres(v);
    if (ch.length !== 8) return false;
    var mois = parseInt(ch.slice(2, 4), 10);
    var jour = parseInt(ch.slice(4, 6), 10);
    if (!((mois >= 1 && mois <= 12) || (mois >= 51 && mois <= 62))) return false;
    return jour >= 1 && jour <= 31;
  }

  function neqValide(valeur) {
    var ch = chiffres(valeur);
    if (ch.length !== 10) return false;
    return ch[0] === "1" || ch[0] === "2" || ch[0] === "3";
  }

  function mod97(numStr) {
    var rem = 0;
    for (var i = 0; i < numStr.length; i++) {
      rem = (rem * 10 + (numStr.charCodeAt(i) - 48)) % 97;
    }
    return rem;
  }

  function ibanValide(valeur) {
    var s = String(valeur).replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    var reag = s.slice(4) + s.slice(0, 4);
    var num = "";
    for (var i = 0; i < reag.length; i++) {
      var c = reag.charCodeAt(i);
      if (c >= 48 && c <= 57) num += reag[i];           // chiffre
      else if (c >= 65 && c <= 90) num += String(c - 55); // A=10 … Z=35
      else return false;
    }
    return mod97(num) === 1;
  }

  function carteCreditValide(valeur) {
    var ch = chiffres(valeur);
    if (ch.length < 13 || ch.length > 19) return false;
    if (new Set(ch.split("")).size === 1) return false;
    return luhnValide(ch);
  }

  function ipv4Valide(valeur) {
    var parties = String(valeur).split(".");
    if (parties.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      if (!/^\d+$/.test(parties[i])) return false;
      var n = parseInt(parties[i], 10);
      if (n < 0 || n > 255) return false;
    }
    return true;
  }

  function telephoneValide(valeur) {
    var ch = chiffres(valeur);
    if (ch[0] === "1" && ch.length === 11) ch = ch.slice(1);
    if (ch.length !== 10) return false;
    if (ch[0] === "0" || ch[0] === "1" || ch[3] === "0" || ch[3] === "1") return false;
    return true;
  }

  function codePostalValide(valeur) {
    return /^[ABCEGHJ-NPRSTVXYabceghj-nprstvxy]\d[A-Za-z][ ]?\d[A-Za-z]\d$/.test(String(valeur).trim());
  }

  function entropieShannon(s) {
    if (!s) return 0;
    var freq = {};
    for (var i = 0; i < s.length; i++) { var c = s[i]; freq[c] = (freq[c] || 0) + 1; }
    var n = s.length, ent = 0;
    for (var k in freq) {
      if (Object.prototype.hasOwnProperty.call(freq, k)) {
        var p = freq[k] / n;
        ent -= p * (Math.log(p) / Math.log(2));
      }
    }
    return ent;
  }

  function secretGeneriqueValide(valeur) {
    var v = String(valeur).trim().replace(/^['"]+|['"]+$/g, "");
    if (v.length < 12) return false;
    if (entropieShannon(v) < 3.2) return false;
    if (/^[A-Za-z]+$/.test(v)) return false; // juste des mots
    return true;
  }

  // ---------------------------------------------------------------
  //  2) MASQUAGE (on ne révèle jamais la valeur brute)
  // ---------------------------------------------------------------
  function Masqueur(sel, montrer4Derniers) {
    this.sel = sel || String(Math.floor(performance.now() * 1000)) + "-tilex";
    this.montrer4 = !!montrer4Derniers;
  }
  // Hachage salé synchrone (cyrb53) → 6 hex. Sert à corréler les
  // doublons sans révéler la valeur ; non réversible en pratique.
  Masqueur.prototype.sceau = function (valeur) {
    var brut = chiffres(valeur) || String(valeur);
    var str = this.sel + "::" + brut;
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var val = (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
    return val.slice(0, 6).padStart(6, "0");
  };
  Masqueur.prototype.masquer = function (valeur, style) {
    valeur = String(valeur);
    if (style === "courriel") return this._masquerCourriel(valeur);
    if (style === "total") return valeur.replace(/\S/g, "x");
    var garder = (this.montrer4 && style === "carte") ? 4 : 0;
    var chars = valeur.split("");
    var posAlnum = [];
    for (var i = 0; i < chars.length; i++) if (/[A-Za-z0-9]/.test(chars[i])) posAlnum.push(i);
    var aGarder = new Set(garder ? posAlnum.slice(posAlnum.length - garder) : []);
    for (var j = 0; j < chars.length; j++) {
      if (/[A-Za-z0-9]/.test(chars[j]) && !aGarder.has(j)) chars[j] = "x";
    }
    return chars.join("");
  };
  Masqueur.prototype._masquerCourriel = function (valeur) {
    var m = valeur.match(/^([^@]+)@(.+)$/);
    if (!m) return valeur.replace(/\S/g, "x");
    var nom = m[1], dom = m[2];
    var nomM = nom.length > 1 ? (nom[0] + "x".repeat(nom.length - 1)) : "x";
    var parts = dom.split(".");
    var domM = parts.length >= 2
      ? ("x".repeat(parts[0].length) + "." + parts.slice(1).join("."))
      : "x".repeat(dom.length);
    return nomM + "@" + domM;
  };

  // ---------------------------------------------------------------
  //  3) OBLIGATIONS LOI 25 (source : CAI)
  // ---------------------------------------------------------------
  var OBLIGATIONS = {
    securite: { titre: "Mesures de sécurité raisonnables", article: "art. 10" },
    consentement: { titre: "Consentement manifeste, libre et éclairé", article: "art. 14" },
    conservation: { titre: "Destruction ou anonymisation", article: "art. 23" },
    transparence: { titre: "Transparence et politique de confidentialité", article: "art. 8, 8.1" },
  };
  var SANCTIONS = {
    administratives: "Jusqu'à 10 000 000 $ OU 2 % du chiffre d'affaires mondial (le plus élevé).",
    penales: "Jusqu'à 25 000 000 $ OU 4 % du chiffre d'affaires mondial (le plus élevé). Doublées en cas de récidive.",
    source: "Commission d'accès à l'information du Québec (CAI)",
  };

  // ---------------------------------------------------------------
  //  4) DÉTECTEURS (23) — regex identiques au moteur Python.
  //     Chaque motif est compilé avec les drapeaux « gd » (global +
  //     indices de groupe) pour retrouver la position des captures ;
  //     « i » ajouté seulement là où c'est requis.
  // ---------------------------------------------------------------
  function rx(motif, flags) { return new RegExp(motif, "gd" + (flags || "")); }

  var REGISTRE = [
    { cle: "nas", nom: "NAS (numéro d'assurance sociale)", categorie: "Identité", gravite: "CRITIQUE",
      motif: rx("(?<!\\d)(\\d{3}[ \\-]?\\d{3}[ \\-]?\\d{3})(?!\\d)"), validateur: nasValide,
      motsCles: ["nas", "sin", "assurance sociale", "social insurance"], exigeMotCle: false,
      style: "structure", sensible: true, obligations: ["securite", "consentement", "conservation"] },
    { cle: "nam", nom: "NAM / RAMQ (assurance maladie)", categorie: "Santé", gravite: "CRITIQUE",
      motif: rx("(?<![A-Za-z0-9])([A-Za-z]{4}[ \\-]?\\d{4}[ \\-]?\\d{4})(?![A-Za-z0-9])"), validateur: namValide,
      motsCles: ["nam", "ramq", "assurance maladie", "carte soleil"], exigeMotCle: false,
      style: "structure", sensible: true, obligations: ["securite", "consentement"] },
    { cle: "carte_credit", nom: "Carte de crédit", categorie: "Financier", gravite: "CRITIQUE",
      motif: rx("(?<!\\d)(\\d{4}[ \\-]?\\d{4}[ \\-]?\\d{4}[ \\-]?\\d{1,7}|\\d{13,19})(?!\\d)"), validateur: carteCreditValide,
      motsCles: ["carte", "credit", "crédit", "card", "visa", "mastercard", "amex", "cvv", "ccn"], exigeMotCle: false,
      style: "carte", sensible: true, obligations: ["securite", "consentement"] },
    { cle: "iban", nom: "IBAN (compte bancaire international)", categorie: "Bancaire", gravite: "ELEVE",
      motif: rx("(?<![A-Za-z0-9])([A-Z]{2}\\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4})(?![A-Za-z0-9])"), validateur: ibanValide,
      motsCles: ["iban", "compte", "bank", "banque"], exigeMotCle: false,
      style: "structure", sensible: true, obligations: ["securite"] },
    { cle: "compte_bancaire_ca", nom: "Compte bancaire canadien (transit-inst-compte)", categorie: "Bancaire", gravite: "ELEVE",
      motif: rx("(?<!\\d)(\\d{5}[ \\-]\\d{3}[ \\-]\\d{7,12})(?!\\d)"), validateur: null,
      motsCles: ["transit", "institution", "compte", "account", "banque", "bank", "chèque", "cheque"], exigeMotCle: false,
      style: "structure", sensible: true, obligations: ["securite"] },
    { cle: "swift", nom: "Code SWIFT / BIC", categorie: "Bancaire", gravite: "MOYEN",
      motif: rx("(?<![A-Za-z0-9])([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)(?![A-Za-z0-9])"), validateur: null,
      motsCles: ["swift", "bic", "virement", "wire", "transfert"], exigeMotCle: true,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "neq", nom: "NEQ (n° d'entreprise du Québec)", categorie: "Entreprise", gravite: "FAIBLE",
      motif: rx("(?<!\\d)(\\d{10})(?!\\d)"), validateur: neqValide,
      motsCles: ["neq", "entreprise", "registraire", "req"], exigeMotCle: true,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "bn_arc", nom: "Numéro d'entreprise (ARC/BN)", categorie: "Entreprise", gravite: "MOYEN",
      motif: rx("(?<![A-Za-z0-9])(\\d{9}[ ]?(?:RC|RT|RP|RM)\\d{4})(?![A-Za-z0-9])"), validateur: null,
      motsCles: ["arc", "cra", "tps", "tvq", "gst", "business number"], exigeMotCle: false,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "courriel", nom: "Adresse courriel", categorie: "Contact", gravite: "MOYEN",
      motif: rx("(?<![\\w.])([A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,})(?![\\w.])"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "courriel", sensible: false, obligations: ["securite", "transparence"] },
    { cle: "telephone", nom: "Numéro de téléphone", categorie: "Contact", gravite: "MOYEN",
      motif: rx("(?<!\\d)(\\+?1[ \\-.]?)?(\\(?\\d{3}\\)?[ \\-.]?\\d{3}[ \\-.]?\\d{4})(?!\\d)"), validateur: telephoneValide,
      motsCles: [], exigeMotCle: false,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "code_postal", nom: "Code postal canadien", categorie: "Localisation", gravite: "FAIBLE",
      motif: rx("(?<![A-Za-z0-9])([ABCEGHJ-NPRSTVXY]\\d[A-Z][ ]?\\d[A-Z]\\d)(?![A-Za-z0-9])"), validateur: codePostalValide,
      motsCles: [], exigeMotCle: false,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "date_naissance", nom: "Date de naissance", categorie: "Naissance", gravite: "MOYEN",
      motif: rx("(?<!\\d)(\\d{4}[\\-/]\\d{2}[\\-/]\\d{2}|\\d{2}[\\-/]\\d{2}[\\-/]\\d{4})(?!\\d)"), validateur: null,
      motsCles: ["naissance", "né", "née", "ddn", "dob", "birth", "born", "date de naissance"], exigeMotCle: true,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "permis_saaq", nom: "Permis de conduire (SAAQ)", categorie: "Identité", gravite: "ELEVE",
      motif: rx("(?<![A-Za-z0-9])([A-Za-z]\\d{4}[ \\-]?\\d{6}[ \\-]?\\d{2})(?![A-Za-z0-9])"), validateur: null,
      motsCles: ["permis", "conduire", "saaq", "driver", "licence", "license"], exigeMotCle: true,
      style: "structure", sensible: true, obligations: ["securite"] },
    { cle: "passeport", nom: "Passeport", categorie: "Identité", gravite: "ELEVE",
      motif: rx("(?<![A-Za-z0-9])([A-Z]{2}\\d{6}|[A-Z]{1,2}\\d{6,7})(?![A-Za-z0-9])"), validateur: null,
      motsCles: ["passeport", "passport"], exigeMotCle: true,
      style: "structure", sensible: true, obligations: ["securite"] },
    { cle: "ipv4", nom: "Adresse IP (IPv4)", categorie: "Réseau", gravite: "FAIBLE",
      motif: rx("(?<!\\d)(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})(?!\\d)"), validateur: ipv4Valide,
      motsCles: [], exigeMotCle: false,
      style: "structure", sensible: false, obligations: ["securite"] },
    { cle: "cle_privee", nom: "Clé privée (PEM)", categorie: "Secret", gravite: "CRITIQUE",
      motif: rx("-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"), validateur: null,
      motsCles: [], exigeMotCle: false, grpZero: true,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "aws", nom: "Clé d'accès AWS", categorie: "Secret", gravite: "CRITIQUE",
      motif: rx("(?<![A-Z0-9])((?:AKIA|ASIA)[A-Z0-9]{16})(?![A-Z0-9])"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "jeton_github", nom: "Jeton GitHub", categorie: "Secret", gravite: "CRITIQUE",
      motif: rx("(?<![A-Za-z0-9_])((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,})"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "jeton_slack", nom: "Jeton Slack", categorie: "Secret", gravite: "ELEVE",
      motif: rx("(xox[baprs]-[A-Za-z0-9\\-]{10,})"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "stripe", nom: "Clé secrète Stripe", categorie: "Secret", gravite: "CRITIQUE",
      motif: rx("(?<![A-Za-z0-9])((?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "google_api", nom: "Clé d'API Google", categorie: "Secret", gravite: "ELEVE",
      motif: rx("(?<![A-Za-z0-9])(AIza[0-9A-Za-z\\-_]{35})(?![A-Za-z0-9])"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "jwt", nom: "Jeton JWT", categorie: "Secret", gravite: "ELEVE",
      motif: rx("(eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,})"), validateur: null,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
    { cle: "secret_assigne", nom: "Mot de passe / secret en dur", categorie: "Secret", gravite: "ELEVE",
      motif: rx("(?:password|passwd|pwd|secret|api[_\\-]?key|token|mot[_\\s\\-]?de[_\\s\\-]?passe|cl[eé])\\s*[:=]\\s*['\"]?([^\\s'\"]{8,})['\"]?", "i"),
      validateur: secretGeneriqueValide,
      motsCles: [], exigeMotCle: false,
      style: "total", sensible: false, obligations: ["securite"] },
  ];

  // ---------------------------------------------------------------
  //  5) MOTEUR
  // ---------------------------------------------------------------
  // Retourne l'index du dernier groupe capturant qui a participé
  // (équivalent de m.lastindex en Python), sinon 0.
  function dernierGroupe(m) {
    for (var i = m.length - 1; i >= 1; i--) {
      if (m[i] !== undefined) return i;
    }
    return 0;
  }

  function Moteur(masqueur, detecteurs) {
    this.masqueur = masqueur;
    this.detecteurs = detecteurs || REGISTRE;
    this.trouvailles = [];
    this.fichiersScannes = 0;
    this.fichiersIgnores = 0;
    this.fichiersSensibles = new Set();
  }

  // Scan d'une ligne : retourne les trouvailles VALIDÉES (motif + validateur
  // + exigence de mot-clé). Sert à créer les Trouvailles.
  Moteur.prototype._scannerLigne = function (ligne, ligneMin) {
    var resultats = [];
    for (var d = 0; d < this.detecteurs.length; d++) {
      var det = this.detecteurs[d];
      det.motif.lastIndex = 0;
      var m;
      while ((m = det.motif.exec(ligne)) !== null) {
        if (m.index === det.motif.lastIndex) det.motif.lastIndex++; // évite boucle infinie
        var gi, valeur, debut;
        if (det.grpZero) { gi = 0; valeur = m[0]; debut = m.index; }
        else {
          gi = dernierGroupe(m);
          valeur = gi ? m[gi] : m[0];
          debut = (gi && m.indices && m.indices[gi]) ? m.indices[gi][0] : m.index;
        }
        if (valeur === undefined) continue;
        if (det.validateur && !det.validateur(valeur)) continue;
        if (det.exigeMotCle && det.motsCles.length) {
          var ok = false;
          for (var k = 0; k < det.motsCles.length; k++) {
            if (ligneMin.indexOf(det.motsCles[k]) !== -1) { ok = true; break; }
          }
          if (!ok) continue;
        }
        resultats.push({ det: det, valeur: valeur, debut: debut });
      }
    }
    return resultats;
  };

  // Masque TOUT ce qui ressemble à une donnée sensible sur la ligne, par
  // POSITION (union des spans de tous les motifs, sans validation) : une
  // valeur qui matche un motif mais échoue la validation reste ainsi masquée
  // et ne peut jamais fuir dans le contexte. Le masquage par position est
  // insensible à l'ordre (contrairement à str.replace, qui casse quand un
  // détecteur masque l'intérieur de la valeur d'un autre).
  Moteur.prototype._masquerLigneComplete = function (ligne) {
    var spans = [];
    for (var d = 0; d < this.detecteurs.length; d++) {
      var det = this.detecteurs[d];
      det.motif.lastIndex = 0;
      var m;
      while ((m = det.motif.exec(ligne)) !== null) {
        if (m.index === det.motif.lastIndex) det.motif.lastIndex++;
        var deb, fin;
        if (det.grpZero) { deb = m.index; fin = m.index + m[0].length; }
        else {
          var gi = dernierGroupe(m);
          if (gi && m.indices && m.indices[gi]) { deb = m.indices[gi][0]; fin = m.indices[gi][1]; }
          else { deb = m.index; fin = m.index + m[0].length; }
        }
        if (fin > deb) spans.push([deb, fin]);
      }
    }
    if (!spans.length) return ligne;
    var chars = ligne.split("");
    for (var s = 0; s < spans.length; s++) {
      for (var i = spans[s][0]; i < spans[s][1]; i++) {
        if (/[A-Za-z0-9]/.test(chars[i])) chars[i] = "x";
      }
    }
    return chars.join("");
  };

  Moteur.prototype._contexteMasque = function (ligneMasquee, centre, largeur) {
    largeur = largeur || 34;
    var entier = ligneMasquee.trim();
    if (entier.length <= 90) return entier;
    var deb = Math.max(0, centre - largeur);
    var fin = Math.min(ligneMasquee.length, centre + largeur);
    var extrait = ligneMasquee.slice(deb, fin).trim();
    return (deb > 0 ? "…" : "") + extrait + (fin < ligneMasquee.length ? "…" : "");
  };

  // Scan d'un fichier déjà lu (nom + contenu texte).
  Moteur.prototype.scannerTexte = function (nom, texte) {
    this.fichiersScannes++;
    var lignes = texte.split(/\r\n|\r|\n/);
    var vus = new Set();
    for (var no = 0; no < lignes.length; no++) {
      var ligne = lignes[no];
      if (!ligne.trim()) continue;
      var ligneMin = ligne.toLowerCase();
      var trouves = this._scannerLigne(ligne, ligneMin);
      if (!trouves.length) continue;
      var ligneMasquee = this._masquerLigneComplete(ligne);
      for (var t = 0; t < trouves.length; t++) {
        var det = trouves[t].det, valeur = trouves[t].valeur, debut = trouves[t].debut;
        var sceau = this.masqueur.sceau(valeur);
        var cleDedup = nom + "|" + (no + 1) + "|" + det.cle + "|" + sceau;
        if (vus.has(cleDedup)) continue;
        vus.add(cleDedup);
        this.trouvailles.push({
          fichier: nom, ligne: no + 1, colonne: debut + 1,
          detecteur: det.cle, nom: det.nom, categorie: det.categorie, gravite: det.gravite,
          valeur_masquee: this.masqueur.masquer(valeur, det.style),
          sceau: sceau, sensible: det.sensible, obligations: det.obligations,
          contexte_masque: this._contexteMasque(ligneMasquee, debut),
        });
        if (det.sensible || det.gravite === "CRITIQUE" || det.gravite === "ELEVE") {
          this.fichiersSensibles.add(nom);
        }
      }
    }
  };

  Moteur.prototype.statistiques = function () {
    var parGravite = { CRITIQUE: 0, ELEVE: 0, MOYEN: 0, FAIBLE: 0 };
    var parCategorie = {}, obligations = new Set(), sensibles = 0;
    for (var i = 0; i < this.trouvailles.length; i++) {
      var tr = this.trouvailles[i];
      parGravite[tr.gravite] = (parGravite[tr.gravite] || 0) + 1;
      parCategorie[tr.categorie] = (parCategorie[tr.categorie] || 0) + 1;
      (tr.obligations || []).forEach(function (o) { obligations.add(o); });
      if (tr.sensible) sensibles++;
    }
    return {
      total: this.trouvailles.length,
      par_gravite: parGravite,
      par_categorie: parCategorie,
      sensibles: sensibles,
      fichiers_scannes: this.fichiersScannes,
      fichiers_ignores: this.fichiersIgnores,
      fichiers_sensibles: this.fichiersSensibles.size,
      obligations_touchees: Array.from(obligations).sort(),
    };
  };

  Moteur.prototype.scoreRisque = function () {
    var poids = { CRITIQUE: 25, ELEVE: 10, MOYEN: 4, FAIBLE: 1 };
    var brut = 0, aCritique = false;
    for (var i = 0; i < this.trouvailles.length; i++) {
      brut += poids[this.trouvailles[i].gravite] || 0;
      if (this.trouvailles[i].gravite === "CRITIQUE") aCritique = true;
    }
    var score = Math.min(100, Math.floor(brut));
    if (aCritique) score = Math.max(score, 70);
    var posture;
    if (score === 0) posture = "CONFORME (aucune donnée sensible détectée)";
    else if (score < 25) posture = "FAIBLE RISQUE";
    else if (score < 60) posture = "RISQUE MODÉRÉ — action recommandée";
    else if (score < 85) posture = "RISQUE ÉLEVÉ — action requise";
    else posture = "RISQUE CRITIQUE — action immédiate";
    return { score: score, posture: posture };
  };

  // ---------------------------------------------------------------
  //  6) API PUBLIQUE
  // ---------------------------------------------------------------
  function extEst(nom, ensemble) {
    var i = nom.lastIndexOf(".");
    if (i < 0) return false;
    return ensemble.has(nom.slice(i).toLowerCase());
  }

  // Scanne une liste de File (input/drag-drop). 100 % local, aucun réseau.
  async function scannerFichiers(fichiers, opts) {
    opts = opts || {};
    var masqueur = new Masqueur(opts.sel, opts.montrer4Derniers);
    var moteur = new Moteur(masqueur);
    var tailleMax = (opts.tailleMaxMo || TAILLE_MAX_MO) * 1024 * 1024;
    var liste = Array.prototype.slice.call(fichiers || []);
    for (var i = 0; i < liste.length; i++) {
      var f = liste[i];
      var nom = f.name || ("fichier-" + i);
      if (f.size > tailleMax) { moteur.fichiersIgnores++; continue; }
      if (extEst(nom, EXT_BINAIRES)) { moteur.fichiersIgnores++; continue; }
      var texte;
      try { texte = await f.text(); }
      catch (e) { moteur.fichiersIgnores++; continue; }
      // binaire probable : octet nul dans les 4096 premiers caractères
      if (texte.slice(0, 4096).indexOf("\x00") !== -1) { moteur.fichiersIgnores++; continue; }
      moteur.scannerTexte(nom, texte);
    }
    var stats = moteur.statistiques();
    var sr = moteur.scoreRisque();
    return {
      meta: { outil: "Sentinelle 25", version: "1.0.0", genere_le: new Date().toISOString(),
              avis: "Scan 100 % local — les fichiers n'ont jamais quitté ce navigateur. Valeurs masquées uniquement." },
      score_risque: sr.score, posture: sr.posture,
      statistiques: stats,
      sanctions_loi25: SANCTIONS,
      trouvailles: moteur.trouvailles,
    };
  }

  // ---------------------------------------------------------------
  //  7) RENDU (anti-XSS : textContent partout)
  // ---------------------------------------------------------------
  var STYLE_GRAVITE = {
    CRITIQUE: { label: "CRITIQUE", bg: "rgba(239,68,68,.12)", border: "#ef4444", txt: "#ff6b6b" },
    ELEVE: { label: "ÉLEVÉ", bg: "rgba(245,158,11,.12)", border: "#f59e0b", txt: "#ff9a52" },
    MOYEN: { label: "MOYEN", bg: "rgba(234,179,8,.12)", border: "#eab308", txt: "#e6b84d" },
    FAIBLE: { label: "FAIBLE", bg: "rgba(56,189,248,.12)", border: "#38bdf8", txt: "#7cc7f7" },
  };

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function afficher(cibleSel, rapport) {
    try {
      var cible = typeof cibleSel === "string" ? document.querySelector(cibleSel) : cibleSel;
      if (!cible || !rapport || !rapport.statistiques) return;
      cible.innerHTML = "";
      cible.classList.add("tsn-conteneur");
      var st = rapport.statistiques;

      // Bandeau score
      var band = el("div", "tsn-score");
      var s = rapport.score_risque;
      band.style.borderColor = s >= 60 ? "#ef4444" : (s >= 25 ? "#f59e0b" : "#22c55e");
      band.appendChild(el("div", "tsn-score-val", s + "/100"));
      band.appendChild(el("div", "tsn-score-txt", rapport.posture || ""));
      cible.appendChild(band);

      // Note vie privée
      var note = el("div", "tsn-note", rapport.meta && rapport.meta.avis ? rapport.meta.avis : "");
      cible.appendChild(note);

      // Cartes stats
      var grille = el("div", "tsn-stats");
      [["Fichiers scannés", st.fichiers_scannes], ["Fichiers à risque", st.fichiers_sensibles],
       ["Trouvailles", st.total], ["Sensibles (Loi 25)", st.sensibles]].forEach(function (c) {
        var carte = el("div", "tsn-carte");
        carte.appendChild(el("div", "tsn-carte-val", String(c[1])));
        carte.appendChild(el("div", "tsn-carte-label", c[0]));
        grille.appendChild(carte);
      });
      cible.appendChild(grille);

      // Par gravité
      var gr = el("div", "tsn-gravites");
      ["CRITIQUE", "ELEVE", "MOYEN", "FAIBLE"].forEach(function (g) {
        var n = st.par_gravite[g] || 0;
        if (!n) return;
        var stl = STYLE_GRAVITE[g];
        var pastille = el("span", "tsn-pastille", stl.label + " · " + n);
        pastille.style.background = stl.bg; pastille.style.color = stl.txt; pastille.style.borderColor = stl.border;
        gr.appendChild(pastille);
      });
      cible.appendChild(gr);

      // Trouvailles
      if (!rapport.trouvailles.length) {
        cible.appendChild(el("div", "tsn-vide", "✅ Aucune donnée sensible détectée dans les fichiers scannés."));
      } else {
        var ordre = { CRITIQUE: 0, ELEVE: 1, MOYEN: 2, FAIBLE: 3 };
        var liste = rapport.trouvailles.slice().sort(function (a, b) {
          return (ordre[a.gravite] - ordre[b.gravite]) || a.fichier.localeCompare(b.fichier);
        });
        var wrap = el("div", "tsn-trouvailles");
        liste.forEach(function (tr) {
          var stl = STYLE_GRAVITE[tr.gravite] || STYLE_GRAVITE.FAIBLE;
          var carte = el("div", "tsn-trouvaille");
          carte.style.borderLeftColor = stl.border;
          var hd = el("div", "tsn-tr-hd");
          var badge = el("span", "tsn-badge", stl.label);
          badge.style.background = stl.bg; badge.style.color = stl.txt; badge.style.borderColor = stl.border;
          hd.appendChild(badge);
          hd.appendChild(el("span", "tsn-tr-nom", tr.nom));
          hd.appendChild(el("span", "tsn-tr-cat", tr.categorie + (tr.sensible ? " · sensible" : "")));
          carte.appendChild(hd);
          var loc = el("div", "tsn-tr-loc", tr.fichier + " : ligne " + tr.ligne + ", col " + tr.colonne + "  ·  #" + tr.sceau);
          carte.appendChild(loc);
          var val = el("div", "tsn-tr-val");
          val.appendChild(el("span", "tsn-tr-etiq", "valeur : "));
          val.appendChild(el("span", "tsn-mono", tr.valeur_masquee));
          carte.appendChild(val);
          if (tr.contexte_masque) {
            var ctx = el("div", "tsn-tr-ctx");
            ctx.appendChild(el("span", "tsn-tr-etiq", "contexte : "));
            ctx.appendChild(el("span", "tsn-mono", tr.contexte_masque));
            carte.appendChild(ctx);
          }
          wrap.appendChild(carte);
        });
        cible.appendChild(wrap);
      }

      // Obligations Loi 25
      if (st.obligations_touchees && st.obligations_touchees.length) {
        var obl = el("div", "tsn-obligations");
        obl.appendChild(el("div", "tsn-obl-titre", "⚖️ Obligations Loi 25 concernées"));
        var ul = el("ul");
        st.obligations_touchees.forEach(function (c) {
          var o = OBLIGATIONS[c];
          if (o) ul.appendChild(el("li", null, o.titre + " (" + o.article + ")"));
        });
        obl.appendChild(ul);
        obl.appendChild(el("div", "tsn-obl-avis",
          "Ceci est une aide technique, pas un avis juridique. La Loi 25 comporte aussi des obligations organisationnelles."));
        cible.appendChild(obl);
      }
    } catch (err) {
      console.error("TilexSentinelle.afficher:", err.message);
    }
  }

  // ---------------------------------------------------------------
  //  Export global
  // ---------------------------------------------------------------
  window.TilexSentinelle = {
    scannerFichiers: scannerFichiers,
    afficher: afficher,
    // exposés pour les tests
    _validateurs: { luhnValide: luhnValide, nasValide: nasValide, namValide: namValide,
      neqValide: neqValide, ibanValide: ibanValide, carteCreditValide: carteCreditValide,
      ipv4Valide: ipv4Valide, telephoneValide: telephoneValide, codePostalValide: codePostalValide,
      secretGeneriqueValide: secretGeneriqueValide },
    _Masqueur: Masqueur, _Moteur: Moteur, _REGISTRE: REGISTRE,
  };
})();
