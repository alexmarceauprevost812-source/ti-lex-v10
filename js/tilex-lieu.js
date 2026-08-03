/* ══════════════════════════════════════════════════════════════════════════
   ti-lex v10 — LIEUX DANS LE CHAT
   ---------------------------------------------------------------------------
   Quand l'agent répond avec un bloc ```tilex-lieu, il est remplacé dans la
   conversation par une fiche de lieu : nom, adresse réelle, coordonnées, et
   deux boutons — ouvrir dans TILEXMAP, ou lancer l'itinéraire.

   Format du bloc (JSON) :
     ```tilex-lieu
     {"recherche":"Château Frontenac, Québec"}
     ```
   ou, si les coordonnées sont déjà connues :
     ```tilex-lieu
     {"nom":"Château Frontenac","lat":46.8118,"lon":-71.2055}
     ```
   Plusieurs lieux d'un coup :
     {"lieux":[{"recherche":"Tim Hortons Chicoutimi"},{"recherche":"IGA Jonquière"}]}

   L'adresse vient de Nominatim (OpenStreetMap). Rien n'est inventé : si le
   lieu est introuvable, la fiche le dit au lieu d'afficher une position
   approximative.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CARTE = "/carte";
  var _cache = {};          // recherche → résultat Nominatim (évite les rappels)
  var _seq = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function styles() {
    if (document.getElementById("tilex-lieu-style")) return;
    var s = document.createElement("style");
    s.id = "tilex-lieu-style";
    s.textContent = [
      ".tilex-lieu{margin:10px 0;padding:14px 16px;border-radius:12px;",
      "  background:linear-gradient(135deg,rgba(255,107,0,.09),rgba(255,107,0,.02));",
      "  border:1px solid rgba(255,107,0,.32);}",
      ".tilex-lieu-tete{display:flex;align-items:flex-start;gap:11px;}",
      ".tilex-lieu-ico{font-size:22px;line-height:1;flex-shrink:0;margin-top:2px;}",
      ".tilex-lieu-corps{flex:1;min-width:0;}",
      ".tilex-lieu-nom{font-size:14px;font-weight:700;color:#FF6B00;margin-bottom:3px;}",
      ".tilex-lieu-adr{font-size:12px;color:var(--muted,#9a9aa5);line-height:1.5;}",
      ".tilex-lieu-coord{font-size:10px;color:#6b6b78;font-family:'Share Tech Mono',monospace;margin-top:4px;}",
      ".tilex-lieu-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;}",
      ".tilex-lieu-btn{background:#FF6B00;color:#000;font-size:11px;font-weight:700;",
      "  letter-spacing:.06em;padding:7px 13px;border-radius:8px;text-decoration:none;",
      "  border:none;cursor:pointer;display:inline-block;transition:background .15s;}",
      ".tilex-lieu-btn:hover{background:#ff9040;}",
      ".tilex-lieu-btn.sec{background:transparent;color:#FF6B00;border:1px solid rgba(255,107,0,.45);}",
      ".tilex-lieu-btn.sec:hover{background:rgba(255,107,0,.1);}",
      ".tilex-lieu-attente{font-size:12px;color:var(--muted,#9a9aa5);}",
      ".tilex-lieu-vide{border-color:rgba(255,127,39,.25);background:rgba(255,127,39,.06);}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ─── Géocodage réel (Nominatim) ──────────────────────────────────────── */
  async function geocoder(recherche) {
    var cle = recherche.toLowerCase().trim();
    if (_cache[cle] !== undefined) return _cache[cle];
    try {
      var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1" +
        "&addressdetails=1&countrycodes=ca,us&q=" + encodeURIComponent(recherche);
      var r = await fetch(url, { headers: { "Accept-Language": "fr" } });
      if (!r.ok) throw new Error("Nominatim " + r.status);
      var d = await r.json();
      _cache[cle] = (Array.isArray(d) && d.length) ? d[0] : null;
    } catch (e) {
      console.warn("[tilex-lieu] géocodage échoué :", e.message);
      _cache[cle] = null;
    }
    return _cache[cle];
  }

  function lienCarte(lat, lon, nom) {
    return CARTE + "?lat=" + encodeURIComponent(lat) +
      "&lon=" + encodeURIComponent(lon) +
      "&nom=" + encodeURIComponent(nom);
  }

  function ficheHTML(lieu) {
    var nom = esc(lieu.nom);
    var adr = lieu.adresse ? '<div class="tilex-lieu-adr">' + esc(lieu.adresse) + "</div>" : "";
    var coord = '<div class="tilex-lieu-coord">' +
      Number(lieu.lat).toFixed(5) + ", " + Number(lieu.lon).toFixed(5) + "</div>";
    return '<div class="tilex-lieu"><div class="tilex-lieu-tete">' +
      '<span class="tilex-lieu-ico">📍</span>' +
      '<div class="tilex-lieu-corps">' +
      '<div class="tilex-lieu-nom">' + nom + "</div>" + adr + coord +
      '<div class="tilex-lieu-actions">' +
      '<a class="tilex-lieu-btn" href="' + esc(lienCarte(lieu.lat, lieu.lon, lieu.nom)) +
      '">🗺️ Voir sur TILEXMAP</a>' +
      '<a class="tilex-lieu-btn sec" href="' +
      esc(lienCarte(lieu.lat, lieu.lon, lieu.nom) + "&itineraire=1") + '">🚗 Itinéraire</a>' +
      "</div></div></div></div>";
  }

  function videHTML(recherche) {
    return '<div class="tilex-lieu tilex-lieu-vide"><div class="tilex-lieu-tete">' +
      '<span class="tilex-lieu-ico">🔎</span><div class="tilex-lieu-corps">' +
      '<div class="tilex-lieu-nom">Lieu introuvable</div>' +
      '<div class="tilex-lieu-adr">Aucun résultat pour « ' + esc(recherche) +
      ' » dans OpenStreetMap. Essaie avec la ville ou une adresse plus précise.</div>' +
      "</div></div></div>";
  }

  /* ─── Résout une entrée du bloc en fiche affichable ───────────────────── */
  async function resoudre(entree) {
    if (entree && entree.lat != null && entree.lon != null) {
      return {
        nom: entree.nom || entree.recherche || "Lieu",
        adresse: entree.adresse || "",
        lat: entree.lat,
        lon: entree.lon
      };
    }
    var recherche = (entree && (entree.recherche || entree.nom || entree.q)) || "";
    if (!recherche) return null;
    var r = await geocoder(recherche);
    if (!r) return { introuvable: true, recherche: recherche };
    return {
      nom: entree.nom || (r.name || r.display_name.split(",")[0]),
      adresse: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon)
    };
  }

  function lireSpec(brut) {
    try {
      var o = JSON.parse(brut);
      if (Array.isArray(o)) return o;
      if (o && Array.isArray(o.lieux)) return o.lieux;
      return [o];
    } catch (e) {
      // Un LLM écrit parfois juste le nom du lieu, sans JSON : on l'accepte.
      var t = String(brut || "").trim();
      return t ? [{ recherche: t.replace(/^["']|["']$/g, "") }] : [];
    }
  }

  /* ─── Remplace les blocs ```tilex-lieu d'une bulle par des fiches ─────── */
  function rendre(el) {
    if (!el) return;
    styles();
    var blocs = [];
    var codes = el.querySelectorAll('code[class*="language-"]');
    for (var i = 0; i < codes.length; i++) {
      if (/language-(tilex-lieu|lieu|carte)\b/.test(codes[i].className || "")) blocs.push(codes[i]);
    }
    for (var b = 0; b < blocs.length; b++) {
      (function (code) {
        var brut = (code.textContent || "").trim();
        var wrap = code.closest(".code-block-wrap") || code.parentElement;
        var holder = document.createElement("div");
        holder.id = "lieu" + (++_seq);
        holder.innerHTML = '<div class="tilex-lieu"><span class="tilex-lieu-attente">' +
          "📍 Recherche du lieu…</span></div>";
        if (wrap && wrap.parentNode) wrap.parentNode.replaceChild(holder, wrap);

        var entrees = lireSpec(brut);
        if (!entrees.length) {
          holder.innerHTML = videHTML(brut.slice(0, 60));
          return;
        }
        Promise.all(entrees.slice(0, 6).map(resoudre)).then(function (lieux) {
          var html = lieux.map(function (l) {
            if (!l) return "";
            return l.introuvable ? videHTML(l.recherche) : ficheHTML(l);
          }).join("");
          holder.innerHTML = html || videHTML(brut.slice(0, 60));
        }).catch(function () {
          holder.innerHTML = videHTML(brut.slice(0, 60));
        });
      })(blocs[b]);
    }
  }

  global.TilexLieu = { rendre: rendre, geocoder: geocoder, lienCarte: lienCarte };
  global.renderLieuxInBubble = rendre;   // même convention que les schémas
})(window);
