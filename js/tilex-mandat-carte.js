/* ══════════════════════════════════════════════════════════════════════════
   ti-lex v10 — MANDAT DE SCAN DANS LE CHAT
   ---------------------------------------------------------------------------
   Quand l'agent (ou un déclencheur local dans le composer) répond avec un
   bloc ```tilex-mandat, il est remplacé par une carte : rappel des 3 étapes
   du mandat, et un bouton qui ouvre le vrai guide (js/tilex-mandat.js) —
   celui déjà branché pour de vrai sur le projet Supabase (table scan_mandats,
   RLS par utilisateur, DNS-over-HTTPS, signature horodatée + IP).

   Ce fichier ne touche PAS au fonctionnement du mandat lui-même : il ne fait
   qu'offrir un point d'entrée depuis la conversation, cohérent avec les
   cartes ```tilex-schema et ```tilex-lieu déjà présentes dans le chat.

   Format du bloc (JSON, tout est optionnel) :
     ```tilex-mandat
     {"domaine":"exemple.com"}
     ```
   Sans domaine, le guide s'ouvre et la personne le tape elle-même — c'est le
   comportement normal du guide.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function styles() {
    if (document.getElementById("tilex-mdt-style")) return;
    var s = document.createElement("style");
    s.id = "tilex-mdt-style";
    s.textContent = [
      ".tilex-mdt{margin:10px 0;padding:14px 16px;border-radius:12px;",
      "  background:linear-gradient(135deg,rgba(240,180,41,.10),rgba(240,180,41,.02));",
      "  border:1px solid rgba(240,180,41,.35);}",
      ".tilex-mdt-tete{display:flex;align-items:flex-start;gap:11px;}",
      ".tilex-mdt-ico{font-size:22px;line-height:1;flex-shrink:0;margin-top:1px;}",
      ".tilex-mdt-corps{flex:1;min-width:0;}",
      ".tilex-mdt-nom{font-size:14px;font-weight:700;color:#f0b429;margin-bottom:2px;}",
      ".tilex-mdt-dom{font-size:11px;color:#e6c877;font-family:'Share Tech Mono',monospace;margin-bottom:7px;}",
      ".tilex-mdt-etapes{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}",
      ".tilex-mdt-etape{font-size:10.5px;color:#c9b98a;background:rgba(240,180,41,.08);",
      "  border:1px solid rgba(240,180,41,.22);border-radius:20px;padding:3px 10px;white-space:nowrap;}",
      ".tilex-mdt-note{font-size:11.5px;color:var(--muted,#9a9aa5);line-height:1.55;margin-bottom:11px;}",
      ".tilex-mdt-btn{background:#f0b429;color:#1a1200;font-size:11px;font-weight:800;",
      "  letter-spacing:.05em;padding:8px 15px;border-radius:8px;border:none;cursor:pointer;",
      "  transition:background .15s;}",
      ".tilex-mdt-btn:hover{background:#ffc94d;}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function nettoyerDomaine(d) {
    return String(d || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/:?#].*$/, "");
  }

  function carteHTML(domaine) {
    var dom = nettoyerDomaine(domaine);
    var action = dom
      ? "TilexMandat.reprendre('" + dom.replace(/'/g, "\\'") + "')"
      : "TilexMandat.ouvrir()";
    return '<div class="tilex-mdt"><div class="tilex-mdt-tete">' +
      '<span class="tilex-mdt-ico">🔒</span>' +
      '<div class="tilex-mdt-corps">' +
      '<div class="tilex-mdt-nom">Mandat d’autorisation de scan</div>' +
      (dom ? '<div class="tilex-mdt-dom">' + esc(dom) + "</div>" : "") +
      '<div class="tilex-mdt-etapes">' +
      '<span class="tilex-mdt-etape">1 · Prouver la propriété</span>' +
      '<span class="tilex-mdt-etape">2 · Signer le mandat</span>' +
      '<span class="tilex-mdt-etape">3 · Scanner</span>' +
      "</div>" +
      '<div class="tilex-mdt-note">Le guide te fait passer par les 3 étapes, connecté pour de vrai à ta base Supabase (table scan_mandats, RLS — juste toi peux voir tes mandats). Scanner un domaine sans autorisation est une infraction (art. 342.1 du Code criminel).</div>' +
      '<div class="tilex-mdt-actions"><button class="tilex-mdt-btn" onclick="' + action + '">🚀 Ouvrir le guide de mandat</button></div>' +
      "</div></div></div>";
  }

  function lireSpec(brut) {
    try {
      var o = JSON.parse(brut);
      return (o && typeof o === "object") ? o : {};
    } catch (e) {
      // Le modèle écrit parfois juste le domaine, sans JSON.
      var t = String(brut || "").trim().replace(/^["']|["']$/g, "");
      return t ? { domaine: t } : {};
    }
  }

  /* ─── Remplace les blocs ```tilex-mandat d'une bulle par la carte ──────── */
  function rendre(el) {
    if (!el) return;
    styles();
    var blocs = [];
    var codes = el.querySelectorAll('code[class*="language-"]');
    for (var i = 0; i < codes.length; i++) {
      if (/language-(tilex-mandat|mandat)\b/.test(codes[i].className || "")) blocs.push(codes[i]);
    }
    for (var b = 0; b < blocs.length; b++) {
      var code = blocs[b];
      var brut = (code.textContent || "").trim();
      var wrap = code.closest(".code-block-wrap") || code.parentElement;
      var spec = lireSpec(brut);
      var holder = document.createElement("div");
      holder.innerHTML = carteHTML(spec.domaine || "");
      if (wrap && wrap.parentNode) wrap.parentNode.replaceChild(holder, wrap);
    }
  }

  /* ─── Ouvre directement le guide depuis le composer (déclencheur local) ──
     Poste la carte comme le ferait l'agent, sans appel réseau : la personne
     voit tout de suite la même explication, puis clique pour ouvrir le
     guide — un seul chemin visuel, que la demande vienne d'elle ou de l'IA. */
  function guiderDepuisChat(domaine) {
    if (typeof window.addMsg !== "function") {
      // Repli : pas de chat autour (page sans pro.html) → ouvre direct.
      if (window.TilexMandat) window.TilexMandat.ouvrir();
      return;
    }
    var bloc = "```tilex-mandat\n" + JSON.stringify(domaine ? { domaine: domaine } : {}) + "\n```";
    window.addMsg("a",
      "🔒 Avant un scan, faut un mandat — c'est la loi (art. 342.1 C.cr.) pis c'est là pour protéger tout le monde, toi inclus.\n\n" + bloc);
  }

  global.TilexMandatCarte = { rendre: rendre, carteHTML: carteHTML, guiderDepuisChat: guiderDepuisChat };
  global.renderMandatInBubble = rendre;   // même convention que renderSchemasInBubble / renderLieuxInBubble
})(window);
