'use strict';

var TilexSecurityGuard = (function() {

  var QUICK_SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/,
    /sk-ant-[a-zA-Z0-9\-_]{40,}/,
    /ghp_[a-zA-Z0-9]{36}/,
    /gho_[a-zA-Z0-9]{36}/,
    /glpat-[a-zA-Z0-9\-_]{20}/,
    /AKIA[0-9A-Z]{16}/,
    /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/,
    /password\s*[:=]\s*['"]?[^\s'"]{6,}/i,
    /passwd\s*[:=]\s*['"]?[^\s'"]{6,}/i,
    /private[_\s]?key\s*[:=]/i,
    /\b(?:\d[ -]?){13,16}\b/
  ];

  var INJECTION_PATTERNS = [
    /ignore (all |previous |above |your )?instructions/i,
    /forget (everything|all instructions|your system prompt)/i,
    /you are now (DAN|jailbreak|unrestricted|evil|without rules)/i,
    /act as (if you have no|an unrestricted|a jailbroken|DAN)/i,
    /\[system\].*override/i,
    /bypass (your|all|safety|content) (filter|restriction|limit|policy)/i,
    /pretend (you have no|there are no|without any) (rules|limits|restrictions)/i,
    /disregard (your|all|previous) (training|guidelines|instructions|ethics)/i
  ];

  var ILLEGAL_KEYWORDS = [
    "sql injection attack", "ddos attack", "ransomware code",
    "drug synthesis", "synthèse de drogue", "fabriquer de la drogue",
    "make meth", "fentanyl synthesis", "cook heroin",
    "fabriquer une bombe", "make a bomb", "improvised explosive",
    "ghost gun", "weapon instructions",
    "child porn", "cp links", "csam", "underage sexual",
    "credit card dump", "carding tutorial", "card dumps",
    "phishing kit download", "scam page template",
    "money laundering steps", "fake id generator",
    "dox someone", "doxxing", "revenge porn", "stalking tools"
  ];

  function checkMessage(text) {
    if (!text || typeof text !== "string") return { safe: true };

    for (var i = 0; i < INJECTION_PATTERNS.length; i++) {
      if (INJECTION_PATTERNS[i].test(text)) {
        return {
          safe: false,
          reason: "prompt_injection",
          warning: "🛡️ Tentative de manipulation de l'IA détectée et bloquée."
        };
      }
    }

    for (var j = 0; j < QUICK_SECRET_PATTERNS.length; j++) {
      if (QUICK_SECRET_PATTERNS[j].test(text)) {
        return {
          safe: false,
          reason: "sensitive_content",
          warning: "⚠️ Ton message semble contenir des informations sensibles (clé API, mot de passe, numéro de carte). Il a été bloqué pour ta sécurité."
        };
      }
    }

    var lower = text.toLowerCase();
    for (var k = 0; k < ILLEGAL_KEYWORDS.length; k++) {
      if (lower.indexOf(ILLEGAL_KEYWORDS[k]) !== -1) {
        return {
          safe: false,
          reason: "illegal_content",
          warning: "🚫 Cette demande contient du contenu qui ne peut pas être traité par ti-lex."
        };
      }
    }

    return { safe: true };
  }

  function showSecurityAlert(message, type) {
    type = type || "blocked";
    var existing = document.getElementById("tilex-security-alert");
    if (existing) existing.remove();

    var alert = document.createElement("div");
    alert.id = "tilex-security-alert";
    alert.className = "tilex-security-alert tilex-security-alert--" + type;
    alert.innerHTML =
      '<div class="tilex-security-alert__icon">' + (type === "blocked" ? "🛡️" : "⚠️") + '</div>' +
      '<div class="tilex-security-alert__content"><p class="tilex-security-alert__message">' + message + '</p></div>' +
      '<button class="tilex-security-alert__close" onclick="this.parentElement.remove()">✕</button>';

    var chatMsgs = document.getElementById("chat-msgs");
    if (chatMsgs) {
      chatMsgs.appendChild(alert);
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    } else {
      document.body.prepend(alert);
    }

    setTimeout(function() {
      var el = document.getElementById("tilex-security-alert");
      if (el) el.remove();
    }, 6000);
  }

  function logToSupabase(userId, violationType, category, severity, input, pattern) {
    if (typeof supabase === "undefined") return;
    try {
      supabase.from("security_logs").insert({
        user_id: userId || null,
        violation_type: violationType,
        violation_category: category,
        severity: severity,
        original_input: (input || "").slice(0, 500),
        trigger_pattern: pattern || null
      }).then(function() {}).catch(function() {});
    } catch (e) {}
  }

  return {
    checkMessage: checkMessage,
    showSecurityAlert: showSecurityAlert,
    logToSupabase: logToSupabase
  };

})();

window.TilexSecurityGuard = TilexSecurityGuard;
