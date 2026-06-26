// ti-lex v10 — TilexGardien : validation avant push GitHub
var TilexGardien = (function () {
  'use strict';

  var PATTERNS_SECRETS = [
    { nom: 'Clé API OpenAI', regex: /sk-[a-zA-Z0-9]{20,}/ },
    { nom: 'Clé API Anthropic', regex: /sk-ant-[a-zA-Z0-9\-]{20,}/ },
    { nom: 'service_role Supabase', regex: /eyJhbGciOi[A-Za-z0-9\-_]{50,}\.eyJ[A-Za-z0-9\-_]{50,}\.(?=.*service_role)/ },
    { nom: 'Clé privée SSH/PEM', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { nom: 'Token GitHub', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
    { nom: 'Mot de passe en dur', regex: /password\s*[:=]\s*['"][^'"]{4,}['"]/i },
    { nom: 'Secret en dur', regex: /secret\s*[:=]\s*['"][^'"]{4,}['"]/i },
    { nom: 'Clé API générique', regex: /api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i },
    { nom: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
    { nom: 'Token Bearer en dur', regex: /Bearer\s+[A-Za-z0-9\-_.]{20,}/ },
    { nom: 'Variable .env', regex: /process\.env\.[A-Z_]{4,}/i },
    { nom: 'Deno.env.get', regex: /Deno\.env\.get\s*\(/ }
  ];

  var EXCLUSIONS = [
    /supabaseKey|SB_ANON|window\.SB_ANON/,
    /apikey.*cfg\.supabaseKey/
  ];

  function scannerSecrets(code) {
    var alertes = [];
    var lignes = code.split('\n');

    for (var i = 0; i < lignes.length; i++) {
      var ligne = lignes[i];
      var exclue = false;
      for (var e = 0; e < EXCLUSIONS.length; e++) {
        if (EXCLUSIONS[e].test(ligne)) { exclue = true; break; }
      }
      if (exclue) continue;

      for (var p = 0; p < PATTERNS_SECRETS.length; p++) {
        var pat = PATTERNS_SECRETS[p];
        if (pat.regex.test(ligne)) {
          alertes.push({
            type: 'secret',
            niveau: 'critique',
            ligne: i + 1,
            message: pat.nom + ' détecté',
            extrait: ligne.trim().substring(0, 80)
          });
        }
      }
    }
    return alertes;
  }

  function scannerSyntaxe(code, lang) {
    var erreurs = [];
    lang = (lang || 'html').toLowerCase();

    if (lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
      var ouvrantes = 0;
      var fermantes = 0;
      var parenthOuv = 0;
      var parenthFerm = 0;
      var crochetsOuv = 0;
      var crochetsFerm = 0;
      var lignes = code.split('\n');

      for (var i = 0; i < lignes.length; i++) {
        var l = lignes[i];
        for (var c = 0; c < l.length; c++) {
          if (l[c] === '{') ouvrantes++;
          else if (l[c] === '}') fermantes++;
          else if (l[c] === '(') parenthOuv++;
          else if (l[c] === ')') parenthFerm++;
          else if (l[c] === '[') crochetsOuv++;
          else if (l[c] === ']') crochetsFerm++;
        }
      }

      if (ouvrantes !== fermantes) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'Accolades déséquilibrées : ' + ouvrantes + ' { vs ' + fermantes + ' }'
        });
      }
      if (parenthOuv !== parenthFerm) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'Parenthèses déséquilibrées : ' + parenthOuv + ' ( vs ' + parenthFerm + ' )'
        });
      }
      if (crochetsOuv !== crochetsFerm) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'Crochets déséquilibrés : ' + crochetsOuv + ' [ vs ' + crochetsFerm + ' ]'
        });
      }

      for (var i = 0; i < lignes.length; i++) {
        if (/console\.(log|warn|error|debug)\s*\(/.test(lignes[i])) {
          erreurs.push({
            type: 'qualite',
            niveau: 'avertissement',
            ligne: i + 1,
            message: 'console.log restant',
            extrait: lignes[i].trim().substring(0, 60)
          });
        }
      }
    }

    if (lang === 'html') {
      var opens = (code.match(/<script[\s>]/gi) || []).length;
      var closes = (code.match(/<\/script>/gi) || []).length;
      if (opens !== closes) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'Balises <script> déséquilibrées : ' + opens + ' ouvertures vs ' + closes + ' fermetures'
        });
      }
      var styleOpens = (code.match(/<style[\s>]/gi) || []).length;
      var styleCloses = (code.match(/<\/style>/gi) || []).length;
      if (styleOpens !== styleCloses) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'Balises <style> déséquilibrées : ' + styleOpens + ' ouvertures vs ' + styleCloses + ' fermetures'
        });
      }
    }

    if (lang === 'json') {
      try { JSON.parse(code); }
      catch (e) {
        erreurs.push({
          type: 'syntaxe',
          niveau: 'erreur',
          ligne: 0,
          message: 'JSON invalide : ' + e.message
        });
      }
    }

    return erreurs;
  }

  function valider(code, lang) {
    var secrets = scannerSecrets(code);
    var syntaxe = scannerSyntaxe(code, lang);
    var tout = secrets.concat(syntaxe);

    var critiques = tout.filter(function (a) { return a.niveau === 'critique'; });
    var erreurs = tout.filter(function (a) { return a.niveau === 'erreur'; });
    var avertissements = tout.filter(function (a) { return a.niveau === 'avertissement'; });

    return {
      ok: critiques.length === 0 && erreurs.length === 0,
      alertes: tout,
      critiques: critiques,
      erreurs: erreurs,
      avertissements: avertissements,
      resume: critiques.length === 0 && erreurs.length === 0
        ? 'Aucune erreur détectée'
        : critiques.length + ' critique(s), ' + erreurs.length + ' erreur(s), ' + avertissements.length + ' avertissement(s)'
    };
  }

  function afficherResultat(resultat) {
    if (resultat.ok) {
      if (typeof showToastMsg === 'function') showToastMsg('Gardien : aucune erreur détectée');
    } else {
      var msg = 'Gardien BLOQUE :\n';
      resultat.critiques.forEach(function (a) {
        msg += '  CRITIQUE L' + a.ligne + ' : ' + a.message + '\n';
      });
      resultat.erreurs.forEach(function (a) {
        msg += '  ERREUR L' + a.ligne + ' : ' + a.message + '\n';
      });
      if (typeof showToastMsg === 'function') showToastMsg(msg);
    }
    return resultat;
  }

  function validerAvantPush(code, lang) {
    var resultat = valider(code, lang);
    afficherResultat(resultat);

    if (!resultat.ok && resultat.critiques.length > 0) {
      console.warn('[TilexGardien] PUSH BLOQUÉ — secrets détectés', resultat.critiques);
      return false;
    }
    if (!resultat.ok && resultat.erreurs.length > 0) {
      console.warn('[TilexGardien] PUSH BLOQUÉ — erreurs de syntaxe', resultat.erreurs);
      return false;
    }
    return true;
  }

  console.log('[TilexGardien] Chargé — validation pre-push active');

  return {
    valider: valider,
    validerAvantPush: validerAvantPush,
    scannerSecrets: scannerSecrets,
    scannerSyntaxe: scannerSyntaxe,
    afficherResultat: afficherResultat
  };
})();
