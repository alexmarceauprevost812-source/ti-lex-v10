// ════════════════════════════════════════════════════════════════════════
// MOTEUR SCAN AVANCÉ — Détection clés sensibles + Risques + Timer + INDAR
// ════════════════════════════════════════════════════════════════════════

var SCAN_SENSITIVE_PATTERNS = [
  { pattern: /api[_-]?key/i,           categorie: 'API Key',          risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /secret[_-]?key/i,        categorie: 'Secret Key',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /password|passwd|pwd/i,    categorie: 'Mot de passe',     risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /auth[_-]?token/i,         categorie: 'Auth Token',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /bearer/i,                 categorie: 'Bearer Token',     risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /jwt/i,                    categorie: 'JWT Token',        risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /oauth/i,                  categorie: 'OAuth Token',      risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /token/i,                  categorie: 'Token Auth',       risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /db[_-]?pass|database[_-]?password/i, categorie: 'DB Password',  risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /connection[_-]?string/i,  categorie: 'Connection String',risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /mongodb[_-]?uri/i,        categorie: 'MongoDB URI',      risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /mysql[_-]?pass/i,         categorie: 'MySQL Password',   risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /postgres[_-]?pass/i,      categorie: 'PostgreSQL Pass',  risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /aws[_-]?access[_-]?key/i, categorie: 'AWS Access Key',  risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /aws[_-]?secret/i,         categorie: 'AWS Secret',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /firebase[_-]?key/i,       categorie: 'Firebase Key',     risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /stripe[_-]?key/i,         categorie: 'Stripe Key',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /sendgrid[_-]?key/i,       categorie: 'SendGrid Key',     risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /twilio/i,                 categorie: 'Twilio Credential',risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /anthropic[_-]?key/i,      categorie: 'Anthropic API Key',risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /openai[_-]?key/i,         categorie: 'OpenAI Key',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /private[_-]?key/i,        categorie: 'Clé Privée',       risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /ssh[_-]?key/i,            categorie: 'SSH Key',          risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /ssl[_-]?cert/i,           categorie: 'SSL Certificate',  risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /webhook[_-]?secret/i,     categorie: 'Webhook Secret',   risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /encryption[_-]?key/i,     categorie: 'Clé Chiffrement',  risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /debug[_-]?mode|debug=true/i, categorie: 'Debug Mode ON', risque: 'MOYEN',     couleur: '#ffcf4a' },
  { pattern: /admin[_-]?pass/i,         categorie: 'Admin Password',   risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /root[_-]?pass/i,          categorie: 'Root Password',    risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /\bsalt\b/i,               categorie: 'Salt Cryptographique', risque: 'ÉLEVÉ', couleur: '#ff7f27' },
  { pattern: /access[_-]?token/i,       categorie: 'Access Token',     risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /refresh[_-]?token/i,      categorie: 'Refresh Token',    risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /cookie[_-]?secret/i,      categorie: 'Cookie Secret',    risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /session[_-]?secret/i,     categorie: 'Session Secret',   risque: 'ÉLEVÉ',     couleur: '#ff7f27' },
  { pattern: /social[_-]?insurance|sin\b/i, categorie: 'NAS (SIN)',    risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /credit[_-]?card/i,        categorie: 'Carte de crédit',  risque: 'CRITIQUE',  couleur: '#ff3b3b' },
  { pattern: /date[_-]?of[_-]?birth|dob\b/i, categorie: 'Date naissance', risque: 'MOYEN', couleur: '#ffcf4a' },
];

/* Durées de référence par profil (secondes). Les moteurs tournent 5 à la fois :
   quand le catalogue MoteursCyber est chargé, la durée est recalculée à partir
   des moteurs réellement sélectionnés plutôt que de ces valeurs fixes. */
var SCAN_DUREES = {
  'passive_recon': 45,
  'web_scan': 90,
  'courriel_scan': 60,
  'surface_scan': 150,
  'config_audit': 120,
  'vuln_scan': 180,
  'actif_scan': 150,
  'dark_web_monitor': 240,
  'personnalise': 120,
  'full_audit': 360
};

function scanDureeProfil(typeScan, moteurs) {
  if (window.MoteursCyber) {
    var ids = Array.isArray(moteurs) && moteurs.length
      ? moteurs
      : ((window.MoteursCyber.profilParId(typeScan) || {}).moteurs || []);
    if (ids.length) return window.MoteursCyber.dureeEstimee(ids);
  }
  return SCAN_DUREES[typeScan] || 90;
}

var scanTimerInterval = null;
var scanStartTime = null;
var scanDureeTotal = 0;

function scanDemarrerTimer(typeScan, moteurs) {
  var duree = scanDureeProfil(typeScan, moteurs);
  scanDureeTotal = duree;
  scanStartTime = Date.now();

  var timerEl = document.getElementById('scan-timer-container');
  if (!timerEl) {
    timerEl = document.createElement('div');
    timerEl.id = 'scan-timer-container';
    timerEl.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;background:#0d0d0d;border:2px solid #ff7f27;border-radius:12px;padding:14px 20px;font-family:monospace;box-shadow:0 0 20px rgba(255,127,39,0.4);min-width:200px;';
    document.body.appendChild(timerEl);
  }

  scanTimerInterval = setInterval(function() {
    var elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
    var restant = Math.max(0, duree - elapsed);
    var pct = Math.min(100, Math.round((elapsed / duree) * 100));
    var mm = String(Math.floor(restant / 60)).padStart(2, '0');
    var ss = String(restant % 60).padStart(2, '0');

    timerEl.innerHTML =
      '<div style="color:#ff7f27;font-size:10px;letter-spacing:2px;margin-bottom:6px;">⏱ SCAN EN COURS</div>' +
      '<div style="color:#fff;font-size:24px;font-weight:bold;letter-spacing:3px;">' + mm + ':' + ss + '</div>' +
      '<div style="color:#555;font-size:10px;margin-top:6px;margin-bottom:8px;">' + pct + '% complété</div>' +
      '<div style="background:#1a1a1a;border-radius:4px;height:4px;overflow:hidden;">' +
        '<div style="background:#ff7f27;height:100%;width:' + pct + '%;transition:width 1s;border-radius:4px;box-shadow:0 0 8px #ff7f27;"></div>' +
      '</div>';

    if (restant <= 0) {
      clearInterval(scanTimerInterval);
      timerEl.innerHTML = '<div style="color:#37e0a0;font-size:10px;letter-spacing:2px;">✅ SCAN TERMINÉ</div>';
      setTimeout(function() { timerEl.remove(); }, 3000);
    }
  }, 1000);
}

function scanArreterTimer() {
  if (scanTimerInterval) { clearInterval(scanTimerInterval); scanTimerInterval = null; }
  var timerEl = document.getElementById('scan-timer-container');
  if (timerEl) timerEl.remove();
}

function scanAnalyserClesSensibles(contenuScan) {
  var trouvees = [];
  var contenuStr = typeof contenuScan === 'string' ? contenuScan : JSON.stringify(contenuScan);

  SCAN_SENSITIVE_PATTERNS.forEach(function(p) {
    if (p.pattern.test(contenuStr)) {
      var matches = contenuStr.match(new RegExp(
        '["\']?' + p.pattern.source + '["\']?\\s*[:=]\\s*["\']?([^"\'\\s,}]{0,10})', 'gi'
      ));
      trouvees.push({
        categorie: p.categorie,
        risque: p.risque,
        couleur: p.couleur,
        contexte: matches ? matches[0].split(/[:=]/)[0].trim() : p.categorie
      });
    }
  });

  return trouvees.filter(function(v, i, a) {
    return a.findIndex(function(t) { return t.categorie === v.categorie; }) === i;
  });
}

function scanCalculerScoreRisque(clesSensibles, vulnerabilites) {
  var score = 0;
  clesSensibles.forEach(function(c) {
    if (c.risque === 'CRITIQUE') score += 30;
    else if (c.risque === 'ÉLEVÉ') score += 15;
    else if (c.risque === 'MOYEN') score += 7;
  });
  if (vulnerabilites) score += Math.min(40, vulnerabilites * 5);
  return Math.min(100, score);
}

function scanAfficherRapportCles(conteneur, clesSensibles, scoreRisque) {
  if (!conteneur) return;

  if (clesSensibles.length === 0) {
    conteneur.innerHTML =
      '<div style="margin-top:10px;padding:10px 14px;background:rgba(55,224,160,0.08);border:1px solid rgba(55,224,160,0.3);border-radius:8px;font-family:monospace;font-size:11px;">' +
        '<span style="color:#37e0a0;">✅ Aucune clé sensible détectée</span>' +
      '</div>';
    return;
  }

  var critiqueCount = clesSensibles.filter(function(c) { return c.risque === 'CRITIQUE'; }).length;
  var eleveCount = clesSensibles.filter(function(c) { return c.risque === 'ÉLEVÉ'; }).length;
  var moyenCount = clesSensibles.filter(function(c) { return c.risque === 'MOYEN'; }).length;
  var couleurScore = scoreRisque >= 70 ? '#ff3b3b' : scoreRisque >= 40 ? '#ff7f27' : '#ffcf4a';

  var compteurs = '';
  if (critiqueCount > 0) compteurs += '<span style="color:#ff3b3b;font-family:monospace;font-size:10px;">🔴 ' + critiqueCount + ' CRITIQUE' + (critiqueCount > 1 ? 'S' : '') + '</span>';
  if (eleveCount > 0) compteurs += '<span style="color:#ff7f27;font-family:monospace;font-size:10px;">🟠 ' + eleveCount + ' ÉLEVÉ' + (eleveCount > 1 ? 'S' : '') + '</span>';
  if (moyenCount > 0) compteurs += '<span style="color:#ffcf4a;font-family:monospace;font-size:10px;">🟡 ' + moyenCount + ' MOYEN' + (moyenCount > 1 ? 'S' : '') + '</span>';

  var listeHtml = clesSensibles.map(function(c) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#111;border-radius:6px;border-left:3px solid ' + c.couleur + ';">' +
      '<div><span style="color:#fff;font-family:monospace;font-size:11px;font-weight:bold;">' + c.contexte + '</span>' +
      '<span style="color:#555;font-family:monospace;font-size:10px;margin-left:8px;">' + c.categorie + '</span></div>' +
      '<span style="color:' + c.couleur + ';font-family:monospace;font-size:9px;letter-spacing:1px;background:' + c.couleur + '22;border-radius:4px;padding:2px 6px;">' + c.risque + '</span></div>';
  }).join('');

  conteneur.innerHTML =
    '<div style="margin-top:12px;border:1px solid #23232c;border-radius:10px;overflow:hidden;background:#0d0d0d;">' +
      '<div style="padding:10px 14px;background:#111;border-bottom:1px solid #23232c;display:flex;align-items:center;justify-content:space-between;">' +
        '<span style="color:#ff7f27;font-family:monospace;font-size:10px;letter-spacing:2px;">🔍 CLÉS POTENTIELLEMENT EXPOSÉES</span>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="color:' + couleurScore + ';font-family:monospace;font-size:11px;font-weight:bold;">RISQUE ' + scoreRisque + '/100</span>' +
          '<div style="width:60px;height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;width:' + scoreRisque + '%;background:' + couleurScore + ';border-radius:3px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:8px 14px;display:flex;gap:12px;border-bottom:1px solid #23232c;">' + compteurs + '</div>' +
      '<div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px;">' + listeHtml + '</div>' +
      '<div style="padding:8px 14px;border-top:1px solid #23232c;">' +
        '<span style="color:#444;font-family:monospace;font-size:10px;">⚠️ Seules les clés sont affichées — valeurs masquées pour sécurité</span>' +
      '</div>' +
    '</div>';
}

async function indarResumerScan(scanResultat, typeScan) {
  if (typeof INDAR_AGENTS === 'undefined' || typeof INDAR_LOGOS === 'undefined') return;

  var panneau = document.getElementById('indar-scan-resume');
  if (!panneau) {
    panneau = document.createElement('div');
    panneau.id = 'indar-scan-resume';
    panneau.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:99999;overflow-y:auto;padding:20px;font-family:monospace;';
    document.body.appendChild(panneau);
  }

  var agentsHtml = INDAR_AGENTS.map(function(agent) {
    return '<div id="resume-' + agent.id + '" style="background:#0d0d0d;border:1px solid ' + agent.couleur + ';border-radius:10px;overflow:hidden;">' +
      '<div style="padding:12px 16px;background:#111;border-bottom:1px solid ' + agent.couleur + ';display:flex;align-items:center;gap:10px;">' +
        '<div style="width:36px;height:36px;border-radius:8px;border:1px solid ' + agent.couleur + ';display:flex;align-items:center;justify-content:center;background:#0a0a0a;overflow:hidden;flex-shrink:0;">' +
          INDAR_LOGOS[agent.logoKey] +
        '</div>' +
        '<div style="flex:1;"><div style="color:#fff;font-weight:bold;font-size:12px;">' + agent.nom + '</div>' +
        '<div style="color:#555;font-size:10px;">' + agent.role + '</div></div>' +
        '<div style="color:' + agent.couleur + ';font-size:10px;letter-spacing:2px;">⏳ ANALYSE...</div>' +
      '</div>' +
      '<div style="padding:14px 16px;color:#444;font-size:11px;font-style:italic;">Consultation de Claude API en cours...</div>' +
    '</div>';
  }).join('');

  var typeLabel = typeScan ? typeScan.replace(/_/g, ' ').toUpperCase() : 'SCAN';

  panneau.innerHTML =
    '<div style="max-width:700px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #ff7f27;">' +
        '<div>' +
          '<div style="color:#ff7f27;font-size:10px;letter-spacing:3px;margin-bottom:4px;">RAPPORT FINAL — CENTRE INDAR</div>' +
          '<div style="color:#fff;font-size:20px;font-weight:bold;">Analyse ' + typeLabel + '</div>' +
          '<div style="color:#555;font-size:10px;">' + new Date().toLocaleString('fr-CA') + ' · 6 agents en analyse</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'indar-scan-resume\').remove()" style="background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;padding:8px 16px;cursor:pointer;font-family:monospace;">✕ FERMER</button>' +
      '</div>' +
      '<div id="indar-resume-agents" style="display:flex;flex-direction:column;gap:16px;">' + agentsHtml + '</div>' +
    '</div>';

  for (var i = 0; i < INDAR_AGENTS.length; i++) {
    var agent = INDAR_AGENTS[i];
    var el = document.getElementById('resume-' + agent.id);

    try {
      var resp = await fetch('/api/indar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          scanData: scanResultat,
          userMessage: 'Voici les résultats du scan "' + typeScan + '". Donne un résumé concis (max 150 mots) de ton analyse sous ton angle d\'expertise. Sois direct et actionnable.'
        })
      });

      var data = await resp.json();
      var reponse = data.reponse || 'Analyse indisponible.';

      if (el) {
        el.innerHTML =
          '<div style="padding:12px 16px;background:#111;border-bottom:1px solid ' + agent.couleur + ';display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:8px;border:1px solid ' + agent.couleur + ';display:flex;align-items:center;justify-content:center;background:#0a0a0a;overflow:hidden;flex-shrink:0;">' +
              INDAR_LOGOS[agent.logoKey] +
            '</div>' +
            '<div style="flex:1;"><div style="color:#fff;font-weight:bold;font-size:12px;">' + agent.nom + '</div>' +
            '<div style="color:#555;font-size:10px;">' + agent.role + '</div></div>' +
            '<div style="color:#37e0a0;font-size:10px;letter-spacing:2px;">✅ ANALYSÉ</div>' +
          '</div>' +
          '<div style="padding:14px 16px;color:#ccc;font-size:12px;line-height:1.7;white-space:pre-wrap;">' + reponse + '</div>';
      }
    } catch (err) {
      if (el) {
        var corps = el.querySelector('div:last-child');
        if (corps) corps.innerHTML = '<span style="color:#ff3b3b;">❌ Erreur: ' + err.message + '</span>';
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// FIN MOTEUR SCAN AVANCÉ
// ════════════════════════════════════════════════════════════════════════
