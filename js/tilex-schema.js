/* ============================================================
   ti-lex-AL v10 — js/tilex-schema.js
   Rôle : générer des schémas/diagrammes SVG dans ti-lex.
   3 couleurs principales + thème jour/nuit (comme le moteur de
   schéma de Claude, mais aux couleurs de ti-lex).

   Style ti-lex : vanilla JS pur, AUCUN import/export,
   global sur window, try/catch partout, commentaires en français.

   Exemple d'usage :
     TilexSchemaManager.generer('#mon-canvas', {
       titre: 'Pipeline image',
       theme: 'auto',                 // 'auto' | 'jour' | 'nuit'
       noeuds: [
         { id: 'a', titre: 'Toi',          sous: 'idée en joual', couleur: 'neutre' },
         { id: 'b', titre: 'ti-lex',       sous: 'frontend',      couleur: 1 },
         { id: 'c', titre: 'Claude',       sous: 'fait le prompt', couleur: 2 },
         { id: 'd', titre: 'Moteur image', sous: 'fait les pixels', couleur: 3 },
         { id: 'e', titre: 'Image',        sous: 'affichée',      couleur: 'neutre' }
       ]
       // liens optionnels ; par défaut, flux séquentiel a->b->c->d->e
     });
   ============================================================ */

/* ----------  Toast partagé (chaîne de priorité)  ---------- */
window.tilexToast = window.tilexToast || function (message, type) {
  try {
    if (window.TilexToast && typeof window.TilexToast.show === "function") {
      window.TilexToast.show(message, type);
    } else if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else {
      console.log("[ti-lex:" + (type || "info") + "] " + message);
    }
  } catch (e) {
    console.log("[ti-lex] " + message);
  }
};

window.TilexSchemaManager = {

  config: {
    largeur: 360,       // largeur du viewBox
    boxW: 260,          // largeur d'une boîte
    boxH: 58,           // hauteur d'une boîte (titre + sous-titre)
    gap: 36,            // espace vertical pour la flèche
    margeHaut: 24,
  },

  dernierConteneur: null,

  // ============================================================
  // 1. GÉNÉRER LE SCHÉMA
  // ============================================================
  generer(cibleSelector, schema) {
    try {
      const cible = typeof cibleSelector === "string"
        ? document.querySelector(cibleSelector)
        : cibleSelector;

      if (!cible) {
        console.error("TilexSchemaManager: cible introuvable");
        return;
      }
      if (!schema || !Array.isArray(schema.noeuds) || schema.noeuds.length === 0) {
        console.error("TilexSchemaManager: aucun noeud fourni");
        window.tilexToast("Schéma vide", "attention");
        return;
      }

      this.dernierConteneur = cible;

      // Thème : auto (système), jour, ou nuit
      const theme = schema.theme || "auto";
      if (theme === "auto") {
        cible.removeAttribute("data-tilex-theme");
      } else {
        cible.setAttribute("data-tilex-theme", theme);
      }

      const svg = this.construireSVG(schema);
      cible.classList.add("tilex-schema");
      cible.innerHTML = svg;

      console.log("📊 TilexSchemaManager : schéma généré");
    } catch (err) {
      console.error("TilexSchemaManager generer:", err.message);
      window.tilexToast("Erreur de génération du schéma", "erreur");
    }
  },

  // ============================================================
  // 2. CONSTRUIRE LE SVG (chaîne)
  // ============================================================
  construireSVG(schema) {
    try {
      const c = this.config;
      const noeuds = schema.noeuds;
      const boxX = Math.round((c.largeur - c.boxW) / 2);

      // Position verticale de chaque boîte, indexée par id
      const pos = {};
      noeuds.forEach((n, i) => {
        pos[n.id != null ? n.id : i] = {
          index: i,
          x: boxX,
          y: c.margeHaut + i * (c.boxH + c.gap),
        };
      });

      const hauteur = c.margeHaut + noeuds.length * (c.boxH + c.gap)
        - c.gap + c.margeHaut;

      // Liens : fournis, sinon flux séquentiel
      let liens = Array.isArray(schema.liens) ? schema.liens : null;
      if (!liens) {
        liens = [];
        for (let i = 0; i < noeuds.length - 1; i++) {
          liens.push({
            de: noeuds[i].id != null ? noeuds[i].id : i,
            a: noeuds[i + 1].id != null ? noeuds[i + 1].id : (i + 1),
          });
        }
      }

      let svg = '<svg width="100%" viewBox="0 0 ' + c.largeur + ' ' + hauteur +
        '" role="img" class="tilex-schema-svg" xmlns="http://www.w3.org/2000/svg">';
      svg += '<title>' + this.echapper(schema.titre || "Schéma ti-lex") + '</title>';

      // Marqueur de flèche
      svg += '<defs><marker id="tilex-arrow" viewBox="0 0 10 10" refX="8" refY="5" ' +
        'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M2 1L8 5L2 9" fill="none" class="tilex-arr-tete" ' +
        'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';

      // Flèches d'abord (sous les boîtes)
      liens.forEach((l) => { svg += this.flecheEntre(pos, l); });

      // Boîtes ensuite (par-dessus)
      noeuds.forEach((n, i) => {
        const p = pos[n.id != null ? n.id : i];
        svg += this.boite(n, p, c);
      });

      svg += '</svg>';
      return svg;
    } catch (err) {
      console.error("TilexSchemaManager construireSVG:", err.message);
      return '<svg role="img" viewBox="0 0 360 60"><title>Erreur</title></svg>';
    }
  },

  // ============================================================
  // 3. UNE BOÎTE
  // ============================================================
  boite(n, p, c) {
    try {
      const classe = this.classeCouleur(n.couleur);
      const cx = p.x + c.boxW / 2;
      const aDeuxLignes = !!n.sous;
      const yTitre = aDeuxLignes ? p.y + 22 : p.y + c.boxH / 2;

      let s = '<g class="tilex-noeud ' + classe + '">';
      s += '<rect x="' + p.x + '" y="' + p.y + '" width="' + c.boxW +
        '" height="' + c.boxH + '" rx="10" class="tilex-noeud-rect"/>';
      s += '<text x="' + cx + '" y="' + yTitre +
        '" text-anchor="middle" dominant-baseline="central" ' +
        'class="tilex-noeud-titre">' + this.echapper(n.titre || "") + '</text>';
      if (aDeuxLignes) {
        s += '<text x="' + cx + '" y="' + (p.y + 40) +
          '" text-anchor="middle" dominant-baseline="central" ' +
          'class="tilex-noeud-sous">' + this.echapper(n.sous) + '</text>';
      }
      s += '</g>';
      return s;
    } catch (err) {
      console.error("TilexSchemaManager boite:", err.message);
      return "";
    }
  },

  // ============================================================
  // 4. UNE FLÈCHE ENTRE DEUX BOÎTES
  // ============================================================
  flecheEntre(pos, lien) {
    try {
      const a = pos[lien.de];
      const b = pos[lien.a];
      if (!a || !b) return "";

      const c = this.config;
      const cxA = a.x + c.boxW / 2;
      const cxB = b.x + c.boxW / 2;

      // Adjacent vers le bas : flèche droite
      if (b.index === a.index + 1) {
        const y1 = a.y + c.boxH;
        const y2 = b.y - 2;
        return '<line x1="' + cxA + '" y1="' + y1 + '" x2="' + cxB +
          '" y2="' + y2 + '" class="tilex-arr" marker-end="url(#tilex-arrow)"/>';
      }

      // Sinon : coude par la gouttière droite
      const gx = a.x + c.boxW + 22;
      const yA = a.y + c.boxH / 2;
      const yB = b.y + c.boxH / 2;
      const d = "M" + (a.x + c.boxW) + " " + yA +
        " L" + gx + " " + yA +
        " L" + gx + " " + yB +
        " L" + (b.x + c.boxW + 2) + " " + yB;
      return '<path d="' + d + '" fill="none" class="tilex-arr" ' +
        'marker-end="url(#tilex-arrow)"/>';
    } catch (err) {
      console.error("TilexSchemaManager flecheEntre:", err.message);
      return "";
    }
  },

  // ============================================================
  // 5. BASCULER LE THÈME (jour <-> nuit) sur le dernier schéma
  // ============================================================
  basculerTheme() {
    try {
      const cible = this.dernierConteneur;
      if (!cible) return;
      const actuel = cible.getAttribute("data-tilex-theme");
      const prochain = actuel === "nuit" ? "jour" : "nuit";
      cible.setAttribute("data-tilex-theme", prochain);
      window.tilexToast("Thème : " + prochain, "info");
    } catch (err) {
      console.error("TilexSchemaManager basculerTheme:", err.message);
    }
  },

  // ----------  Couleur -> classe CSS  ----------
  classeCouleur(couleur) {
    if (couleur === 1 || couleur === "1") return "tilex-c1";
    if (couleur === 2 || couleur === "2") return "tilex-c2";
    if (couleur === 3 || couleur === "3") return "tilex-c3";
    return "tilex-neutre";
  },

  // ----------  Anti-injection HTML  ----------
  echapper(txt) {
    try {
      const d = document.createElement("div");
      d.textContent = txt == null ? "" : String(txt);
      return d.innerHTML;
    } catch (e) {
      return "";
    }
  },
};
