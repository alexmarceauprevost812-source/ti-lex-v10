// ============================================
// ti-lex — ScanManager
// Module de scans LÉGAUX (passifs / défensifs).
// Analyse uniquement ce que l'utilisateur fournit
// ou tes propres systèmes. Aucune action offensive.
// ============================================

window.ScanManager = (function () {
  "use strict";

  function toast(msg, type) {
    try {
      if (typeof window.showToast === "function") {
        window.showToast(msg, type || "info");
      } else {
        console.log("[ScanManager]", type || "info", msg);
      }
    } catch (e) {
      console.error("[ScanManager] showToast a échoué:", e);
    }
  }

  async function sha1Hex(texte) {
    var data = new TextEncoder().encode(texte);
    var buf = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("")
      .toUpperCase();
  }

  async function sha256Hex(buffer) {
    var buf = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  // ===========================================================
  // 1) SCAN DE CODE — secrets en dur + patterns risqués
  //    Agent CIPHER (briseur de codes)
  // ===========================================================
  function scanCode(code) {
    try {
      if (!code || typeof code !== "string") {
        toast("Aucun code à analyser", "warning");
        return { ok: false, erreur: "Code vide" };
      }

      var regles = [
        { nom: "Clé API générique",        regex: /(api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, gravite: "haute" },
        { nom: "Clé AWS",                  regex: /AKIA[0-9A-Z]{16}/g, gravite: "critique" },
        { nom: "Token JWT",                regex: /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, gravite: "haute" },
        { nom: "Clé privée",               regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, gravite: "critique" },
        { nom: "Mot de passe en dur",      regex: /(password|passwd|pwd|mot_de_passe)\s*[:=]\s*['"][^'"]{4,}['"]/gi, gravite: "haute" },
        { nom: "Clé Supabase secrète",     regex: /service_role|sb_secret_[A-Za-z0-9]+/g, gravite: "critique" },
        { nom: "Usage de eval()",          regex: /\beval\s*\(/g, gravite: "moyenne" },
        { nom: "innerHTML non échappé",    regex: /\.innerHTML\s*=/g, gravite: "moyenne" },
        { nom: "document.write",           regex: /document\.write\s*\(/g, gravite: "basse" }
      ];

      var trouvailles = [];
      regles.forEach(function (r) {
        var m = code.match(r.regex);
        if (m && m.length > 0) {
          trouvailles.push({ type: r.nom, gravite: r.gravite, occurrences: m.length });
        }
      });

      var resultat = {
        ok: true,
        agent: "CIPHER",
        total: trouvailles.length,
        trouvailles: trouvailles,
        verdict: trouvailles.length === 0 ? "Propre" : "Problèmes détectés"
      };

      if (trouvailles.length === 0) {
        toast("Scan de code : aucun problème détecté", "success");
      } else {
        toast("Scan de code : " + trouvailles.length + " problème(s)", "warning");
      }
      return resultat;
    } catch (e) {
      console.error("[ScanManager] scanCode:", e);
      toast("Erreur durant le scan de code", "error");
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // 2) SCAN FUITE DE MOT DE PASSE — HaveIBeenPwned (k-anonymity)
  //    Agent SENTINEL (la vigie)
  //    Le mot de passe complet ne quitte JAMAIS le navigateur.
  // ===========================================================
  async function scanPasswordLeak(motDePasse) {
    try {
      if (!motDePasse || typeof motDePasse !== "string") {
        toast("Aucun mot de passe fourni", "warning");
        return { ok: false, erreur: "Vide" };
      }

      var hash = await sha1Hex(motDePasse);
      var prefixe = hash.slice(0, 5);
      var suffixe = hash.slice(5);

      var reponse = await fetch("https://api.pwnedpasswords.com/range/" + prefixe);
      if (!reponse.ok) {
        throw new Error("API HIBP indisponible (" + reponse.status + ")");
      }
      var texte = await reponse.text();

      var compte = 0;
      var lignes = texte.split("\n");
      for (var i = 0; i < lignes.length; i++) {
        var parts = lignes[i].trim().split(":");
        if (parts[0] === suffixe) {
          compte = parseInt(parts[1], 10) || 0;
          break;
        }
      }

      var resultat = { ok: true, agent: "SENTINEL", compromis: compte > 0, occurrences: compte };

      if (compte > 0) {
        toast("Mot de passe vu " + compte + " fois dans des fuites. À changer.", "error");
      } else {
        toast("Mot de passe absent des fuites connues", "success");
      }
      return resultat;
    } catch (e) {
      console.error("[ScanManager] scanPasswordLeak:", e);
      toast("Erreur durant la vérif de fuite", "error");
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // 3) SCAN URL PHISHING — heuristiques passives (client-side)
  //    Agent SENTINEL (la vigie)
  // ===========================================================
  function scanUrlPhishing(url) {
    try {
      if (!url || typeof url !== "string") {
        toast("Aucune URL fournie", "warning");
        return { ok: false, erreur: "Vide" };
      }

      var u;
      try { u = new URL(url); }
      catch (err) {
        toast("URL invalide", "warning");
        return { ok: false, erreur: "URL invalide" };
      }

      var drapeaux = [];
      var hote = u.hostname;

      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) {
        drapeaux.push("Adresse IP au lieu d'un domaine");
      }
      if (u.protocol !== "https:") {
        drapeaux.push("Connexion non chiffrée (pas de HTTPS)");
      }
      if (hote.split(".").length > 4) {
        drapeaux.push("Trop de sous-domaines (déguisement possible)");
      }
      if (url.indexOf("@") !== -1) {
        drapeaux.push("Présence d'un '@' (redirection trompeuse)");
      }
      var appats = ["login", "verify", "secure", "account", "update", "confirm", "banque", "paypal"];
      appats.forEach(function (mot) {
        if (hote.toLowerCase().indexOf(mot) !== -1) {
          drapeaux.push("Mot d'appât dans le domaine : '" + mot + "'");
        }
      });
      if ((hote.match(/-/g) || []).length >= 3) {
        drapeaux.push("Domaine avec beaucoup de tirets");
      }
      var tldSuspects = [".zip", ".mov", ".tk", ".xyz", ".top", ".click"];
      tldSuspects.forEach(function (tld) {
        if (hote.toLowerCase().endsWith(tld)) {
          drapeaux.push("Extension à risque : '" + tld + "'");
        }
      });

      var score = drapeaux.length;
      var niveau = "faible";
      if (score >= 4) niveau = "élevé";
      else if (score >= 2) niveau = "moyen";

      var resultat = { ok: true, agent: "SENTINEL", hote: hote, risque: niveau, score: score, drapeaux: drapeaux };

      if (score === 0) {
        toast("URL : aucun signe de phishing évident", "success");
      } else {
        toast("URL : risque " + niveau + " (" + score + " signal/aux)", "warning");
      }
      return resultat;
    } catch (e) {
      console.error("[ScanManager] scanUrlPhishing:", e);
      toast("Erreur durant l'analyse d'URL", "error");
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // 4) SCAN FICHIER — empreinte + type + extension (client-side)
  //    Agent MARCEAU (gardien de la mémoire)
  // ===========================================================
  async function scanFile(fichier) {
    try {
      if (!fichier) {
        toast("Aucun fichier fourni", "warning");
        return { ok: false, erreur: "Vide" };
      }

      var buffer = await fichier.arrayBuffer();
      var empreinte = await sha256Hex(buffer);

      var extRisque = ["exe", "scr", "bat", "cmd", "js", "vbs", "ps1", "jar", "msi", "apk", "dll"];
      var nom = fichier.name || "inconnu";
      var ext = nom.indexOf(".") !== -1 ? nom.split(".").pop().toLowerCase() : "";
      var risque = extRisque.indexOf(ext) !== -1;

      var resultat = {
        ok: true,
        agent: "MARCEAU",
        nom: nom,
        taille: fichier.size,
        type: fichier.type || "inconnu",
        extension: ext,
        sha256: empreinte,
        risque: risque
      };

      if (risque) {
        toast("Fichier exécutable/script (." + ext + ") — prudence", "warning");
      } else {
        toast("Fichier analysé — empreinte SHA-256 calculée", "success");
      }
      return resultat;
    } catch (e) {
      console.error("[ScanManager] scanFile:", e);
      toast("Erreur durant l'analyse du fichier", "error");
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // 5) SCAN EN-TÊTES DE SÉCURITÉ — via Edge Function
  //    Agent SENTINEL (la vigie)
  //    Le navigateur ne lit pas les en-têtes cross-origin,
  //    donc on délègue à l'Edge Function scan-headers.
  // ===========================================================
  async function scanSecurityHeaders(url) {
    try {
      if (!url) {
        toast("Aucune URL fournie", "warning");
        return { ok: false, erreur: "Vide" };
      }

      var token = typeof getToken === 'function' ? getToken() : (typeof SB_ANON !== 'undefined' ? SB_ANON : '');
      var sbUrl = typeof SB_URL !== 'undefined' ? SB_URL : '';

      var reponse = await fetch(sbUrl + "/functions/v1/scan-headers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": typeof SB_ANON !== 'undefined' ? SB_ANON : ''
        },
        body: JSON.stringify({ url: url })
      });

      if (!reponse.ok) {
        throw new Error("Edge Function a répondu " + reponse.status);
      }
      var data = await reponse.json();
      toast("Scan en-têtes terminé", "success");
      return { ok: true, agent: "SENTINEL", resultat: data };
    } catch (e) {
      console.error("[ScanManager] scanSecurityHeaders:", e);
      toast("Erreur durant le scan d'en-têtes", "error");
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // SAUVEGARDE INDAR — upsert dans indar_analyses
  // ===========================================================
  async function saveToIndar(agentId, resultat) {
    try {
      if (!window.supabase) return { ok: false, erreur: "Pas de client Supabase" };
      var u = await window.supabase.auth.getUser();
      if (!u.data || !u.data.user) return { ok: false, erreur: "Non authentifié" };

      var r = await window.supabase
        .from("indar_analyses")
        .upsert({
          user_id: u.data.user.id,
          agent_id: agentId,
          analyse: typeof resultat === "string" ? resultat : JSON.stringify(resultat),
          scan_count: 1,
          created_at: new Date().toISOString()
        }, { onConflict: "user_id,agent_id" });

      if (r.error) throw r.error;
      return { ok: true };
    } catch (e) {
      console.error("[ScanManager] saveToIndar:", e);
      return { ok: false, erreur: e.message };
    }
  }

  // ===========================================================
  // SCAN COMPLET — lance les 5 scans sur une cible
  // Appelé par le Centre INDAR lors d'un scan
  // ===========================================================
  async function runFullScan(cible) {
    var resultats = {};

    if (cible && typeof cible === "string") {
      var r1 = scanUrlPhishing(cible);
      resultats.urlPhishing = r1;
      await saveToIndar("SENTINEL", r1);

      var r2 = await scanSecurityHeaders(cible);
      resultats.securityHeaders = r2;
    }

    return resultats;
  }

  return {
    scanCode: scanCode,
    scanPasswordLeak: scanPasswordLeak,
    scanUrlPhishing: scanUrlPhishing,
    scanFile: scanFile,
    scanSecurityHeaders: scanSecurityHeaders,
    saveToIndar: saveToIndar,
    runFullScan: runFullScan
  };
})();

console.log('[ScanManager] Chargé — 5 fonctions de scan légales');
