/* ============================================================
   ti-lex-AL v10 — js/tilex-log-analyst.js
   Rôle : afficher un rapport d'analyse de journaux de sécurité
   (produit par supabase/functions/log-analyst) — cartes de stats
   + liste d'incidents (sévérité, chronologie, entités, évaluation
   de risque, mesures suggérées, pertinence Loi 25).

   Style ti-lex : vanilla JS pur, aucun import/export, global sur
   window, try/catch partout, anti-XSS (textContent partout — le
   rapport contient des messages/chemins fournis par des utilisateurs,
   donc jamais innerHTML sur du texte non fiable).

   Usage :
     TilexLogAnalyst.appelerEtAfficher('#mon-conteneur', { hours: 24 });
     // ou, si le rapport est déjà en main :
     TilexLogAnalyst.afficher('#mon-conteneur', rapportJSON);
   ============================================================ */
window.TilexLogAnalyst = {

  SEVERITE_STYLE: {
    critical: { label: "CRITIQUE", bg: "rgba(230,0,0,.12)", border: "#E60000", txt: "#ff6b6b" },
    high:     { label: "ÉLEVÉE",   bg: "rgba(255,127,39,.12)", border: "#ff7f27", txt: "#ff9a52" },
    medium:   { label: "MOYENNE",  bg: "rgba(230,164,0,.12)", border: "#E6A400", txt: "#e6b84d" },
    low:      { label: "FAIBLE",   bg: "rgba(55,224,160,.10)", border: "#37e0a0", txt: "#37e0a0" },
  },

  // ============================================================
  // 1. APPELLE log-analyst PUIS AFFICHE (nécessite une session admin)
  // ============================================================
  async appelerEtAfficher(cibleSelector, opts) {
    const cible = typeof cibleSelector === "string" ? document.querySelector(cibleSelector) : cibleSelector;
    if (!cible) { console.error("TilexLogAnalyst: cible introuvable"); return; }
    cible.innerHTML = "";
    const chargement = document.createElement("div");
    chargement.className = "tla-chargement";
    chargement.textContent = "🔎 Analyse des journaux en cours…";
    cible.appendChild(chargement);
    try {
      if (!window.supabase) throw new Error("Client Supabase indisponible");
      const sess = await window.supabase.auth.getSession();
      const token = sess && sess.data && sess.data.session ? sess.data.session.access_token : null;
      if (!token) throw new Error("Connecte-toi avec le compte administrateur pour voir ce rapport.");
      const res = await fetch(window.SB_URL + "/functions/v1/log-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ hours: (opts && opts.hours) || 24 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ("Erreur " + res.status));
      this.afficher(cible, data);
    } catch (err) {
      cible.innerHTML = "";
      const erEl = document.createElement("div");
      erEl.className = "tla-erreur";
      erEl.textContent = "⚠️ " + (err.message || "Impossible de charger le rapport.");
      cible.appendChild(erEl);
    }
  },

  // ============================================================
  // 2. AFFICHE un rapport déjà obtenu
  // ============================================================
  afficher(cibleSelector, rapport) {
    try {
      const cible = typeof cibleSelector === "string" ? document.querySelector(cibleSelector) : cibleSelector;
      if (!cible) { console.error("TilexLogAnalyst: cible introuvable"); return; }
      if (!rapport || !rapport.stats) { console.error("TilexLogAnalyst: rapport invalide"); return; }
      cible.innerHTML = "";
      cible.classList.add("tla-conteneur");

      cible.appendChild(this._blocEntete(rapport.meta));
      cible.appendChild(this._blocStats(rapport.stats));
      cible.appendChild(this._blocIncidents(rapport.incidents || []));
    } catch (err) {
      console.error("TilexLogAnalyst afficher:", err.message);
    }
  },

  // ---------- En-tête (méta + note de source, honnêteté sur ce qui est analysé) ----------
  _blocEntete(meta) {
    const wrap = document.createElement("div");
    wrap.className = "tla-entete";
    const titre = document.createElement("div");
    titre.className = "tla-entete-titre";
    titre.textContent = "📊 Journal de sécurité — dernières " + ((meta && meta.timeframe) || "24h");
    wrap.appendChild(titre);
    if (meta && meta.source_note) {
      const note = document.createElement("div");
      note.className = "tla-entete-note";
      note.textContent = meta.source_note;
      wrap.appendChild(note);
    }
    if (meta && meta.generated_at) {
      const ts = document.createElement("div");
      ts.className = "tla-entete-ts";
      try { ts.textContent = "Généré le " + new Date(meta.generated_at).toLocaleString("fr-CA"); }
      catch (e) { ts.textContent = ""; }
      wrap.appendChild(ts);
    }
    return wrap;
  },

  // ---------- Cartes de statistiques ----------
  _blocStats(stats) {
    const wrap = document.createElement("div");
    wrap.className = "tla-stats-grille";
    const cartes = [
      { label: "Événements totaux", val: stats.total_events },
      { label: "Événements suspects", val: stats.suspicious_events },
      { label: "Incidents critiques", val: stats.critical_incidents },
    ];
    cartes.forEach((c) => {
      const carte = document.createElement("div");
      carte.className = "tla-carte";
      const v = document.createElement("div"); v.className = "tla-carte-val"; v.textContent = String(c.val ?? 0);
      const l = document.createElement("div"); l.className = "tla-carte-label"; l.textContent = c.label;
      carte.appendChild(v); carte.appendChild(l);
      wrap.appendChild(carte);
    });
    if (Array.isArray(stats.top_paths_suspicious) && stats.top_paths_suspicious.length) {
      wrap.appendChild(this._blocTop("Routes les plus ciblées", stats.top_paths_suspicious, (x) => x.path, (x) => x.events));
    }
    if (Array.isArray(stats.top_accounts_targeted) && stats.top_accounts_targeted.length) {
      wrap.appendChild(this._blocTop("Comptes les plus ciblés", stats.top_accounts_targeted, (x) => x.user, (x) => x.events));
    }
    return wrap;
  },
  _blocTop(titre, items, getLabel, getCount) {
    const carte = document.createElement("div");
    carte.className = "tla-carte tla-carte-liste";
    const t = document.createElement("div"); t.className = "tla-carte-label"; t.textContent = titre;
    carte.appendChild(t);
    const liste = document.createElement("ul");
    liste.className = "tla-mini-liste";
    items.slice(0, 5).forEach((it) => {
      const li = document.createElement("li");
      const spanLabel = document.createElement("span"); spanLabel.textContent = getLabel(it) || "?";
      const spanCount = document.createElement("span"); spanCount.className = "tla-mini-count"; spanCount.textContent = String(getCount(it) ?? 0);
      li.appendChild(spanLabel); li.appendChild(spanCount);
      liste.appendChild(li);
    });
    carte.appendChild(liste);
    return carte;
  },

  // ---------- Liste d'incidents ----------
  _blocIncidents(incidents) {
    const wrap = document.createElement("div");
    wrap.className = "tla-incidents";
    if (!incidents.length) {
      const vide = document.createElement("div");
      vide.className = "tla-vide";
      vide.textContent = "✅ Aucun incident détecté sur cette période.";
      wrap.appendChild(vide);
      return wrap;
    }
    const ordre = { critical: 0, high: 1, medium: 2, low: 3 };
    incidents.slice().sort((a, b) => (ordre[a.severity] ?? 9) - (ordre[b.severity] ?? 9))
      .forEach((inc) => wrap.appendChild(this._carteIncident(inc)));
    return wrap;
  },
  _carteIncident(inc) {
    const style = this.SEVERITE_STYLE[inc.severity] || this.SEVERITE_STYLE.low;
    const carte = document.createElement("div");
    carte.className = "tla-incident";
    carte.style.borderLeftColor = style.border;

    const hd = document.createElement("div");
    hd.className = "tla-incident-hd";
    const badge = document.createElement("span");
    badge.className = "tla-badge";
    badge.style.background = style.bg; badge.style.color = style.txt; badge.style.borderColor = style.border;
    badge.textContent = style.label;
    const id = document.createElement("span");
    id.className = "tla-incident-id";
    id.textContent = inc.id || "";
    hd.appendChild(badge); hd.appendChild(id);
    carte.appendChild(hd);

    const resume = document.createElement("div");
    resume.className = "tla-incident-resume";
    resume.textContent = inc.summary || "";
    carte.appendChild(resume);

    if (Array.isArray(inc.timeline) && inc.timeline.length) {
      const tl = document.createElement("div");
      tl.className = "tla-timeline";
      inc.timeline.slice(0, 8).forEach((ev) => {
        const ligne = document.createElement("div");
        ligne.className = "tla-timeline-ligne";
        const ts = document.createElement("span"); ts.className = "tla-timeline-ts";
        try { ts.textContent = new Date(ev.ts).toLocaleString("fr-CA"); } catch (e) { ts.textContent = String(ev.ts || ""); }
        const txt = document.createElement("span"); txt.textContent = ev.event || "";
        ligne.appendChild(ts); ligne.appendChild(txt);
        tl.appendChild(ligne);
      });
      carte.appendChild(tl);
    }

    if (inc.risk_assessment) {
      const ra = document.createElement("div");
      ra.className = "tla-risque";
      const r = inc.risk_assessment;
      ra.textContent = "Risque : " + (r.overall || "?") + " (probabilité " + (r.likelihood || "?") + ") — " + (r.impact || "");
      carte.appendChild(ra);
    }

    if (Array.isArray(inc.suggested_containment) && inc.suggested_containment.length) {
      const conf = document.createElement("div");
      conf.className = "tla-containment";
      const t = document.createElement("div"); t.className = "tla-containment-titre"; t.textContent = "Mesures suggérées :";
      conf.appendChild(t);
      const ul = document.createElement("ul");
      inc.suggested_containment.forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
      conf.appendChild(ul);
      carte.appendChild(conf);
    }

    if (inc.law25_relevance && inc.law25_relevance.personal_data_at_risk) {
      const loi = document.createElement("div");
      loi.className = "tla-loi25";
      loi.textContent = "⚖️ Loi 25 : " + (inc.law25_relevance.description || "Renseignements personnels potentiellement concernés.")
        + (inc.law25_relevance.notification_required ? " — Notification requise." : "");
      carte.appendChild(loi);
    }

    return carte;
  },
};
