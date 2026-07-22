/* ============================================================
   tilex-connect.js — Moteur de connexion visuel
   ti-lex-AL v10 — Alex Marceau-Prévost
   Affiche le logo officiel du service + statut animé
   (connexion en cours / connecté / échec)
   ============================================================ */

const TilexConnect = (() => {

  // --- Logos officiels SVG (aucune dépendance externe) ---
  const LOGOS = {
    google: `<svg viewBox="0 0 48 48" width="28" height="28"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C41.2 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>`,
    supabase: `<svg viewBox="0 0 109 113" width="26" height="26"><path fill="#3ECF8E" d="M63.7 110.3c-2.8 3.5-8.5 1.6-8.6-2.9L53.8 42h43.9c8 0 12.4 9.2 7.4 15.4l-41.4 52.9z"/><path fill="#249361" d="M63.7 110.3c-2.8 3.5-8.5 1.6-8.6-2.9L53.8 42h43.9c8 0 12.4 9.2 7.4 15.4l-41.4 52.9z" opacity=".4"/><path fill="#3ECF8E" d="M45.3 2.4c2.8-3.5 8.5-1.6 8.6 2.9L54.7 71H11.3c-8 0-12.4-9.2-7.4-15.4L45.3 2.4z"/></svg>`,
    github: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#fff" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17 5 18 5.3 18 5.3c.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.6-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>`
  };

  const NOMS = { google: "Google", supabase: "Supabase", github: "GitHub" };

  // --- Injection du CSS (une seule fois) ---
  function injecterStyle() {
    if (document.getElementById("tilex-connect-style")) return;
    const s = document.createElement("style");
    s.id = "tilex-connect-style";
    s.textContent = `
      .tlx-connect-box{display:flex;align-items:center;gap:14px;
        background:#161b22;border:1px solid #30363d;border-radius:14px;
        padding:14px 18px;margin:10px 0;color:#e6edf3;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        max-width:420px;transition:border-color .3s ease;}
      .tlx-connect-box .tlx-logo{width:32px;height:32px;display:flex;
        align-items:center;justify-content:center;flex-shrink:0;}
      .tlx-connect-box .tlx-info{flex:1;min-width:0;}
      .tlx-connect-box .tlx-nom{font-weight:600;font-size:15px;}
      .tlx-connect-box .tlx-statut{font-size:13px;opacity:.75;margin-top:2px;}
      .tlx-spinner{width:18px;height:18px;border:2px solid #30363d;
        border-top-color:#3ECF8E;border-radius:50%;
        animation:tlxspin .7s linear infinite;flex-shrink:0;}
      @keyframes tlxspin{to{transform:rotate(360deg)}}
      .tlx-connect-box.ok{border-color:#238636;}
      .tlx-connect-box.ok .tlx-statut{color:#3fb950;opacity:1;}
      .tlx-connect-box.err{border-color:#da3633;}
      .tlx-connect-box.err .tlx-statut{color:#f85149;opacity:1;}
      .tlx-check{color:#3fb950;font-size:20px;}
      .tlx-cross{color:#f85149;font-size:20px;}
    `;
    document.head.appendChild(s);
  }

  // --- Crée la boîte visuelle pour un service ---
  function creerBoite(service, conteneur) {
    injecterStyle();
    const box = document.createElement("div");
    box.className = "tlx-connect-box";
    box.dataset.service = service;
    box.innerHTML = `
      <div class="tlx-logo">${LOGOS[service] || "🔌"}</div>
      <div class="tlx-info">
        <div class="tlx-nom">${NOMS[service] || service}</div>
        <div class="tlx-statut">En attente...</div>
      </div>
      <div class="tlx-etat"></div>
    `;
    (conteneur || document.body).appendChild(box);
    return box;
  }

  // --- Change l'état visuel : loading / ok / err ---
  function setEtat(box, etat, msg) {
    box.classList.remove("ok", "err");
    const statut = box.querySelector(".tlx-statut");
    const etatEl = box.querySelector(".tlx-etat");
    if (etat === "loading") {
      statut.textContent = msg || "Connexion en cours...";
      etatEl.innerHTML = `<div class="tlx-spinner"></div>`;
    } else if (etat === "ok") {
      box.classList.add("ok");
      statut.textContent = msg || "Connecté";
      etatEl.innerHTML = `<span class="tlx-check">✅</span>`;
    } else if (etat === "err") {
      box.classList.add("err");
      statut.textContent = msg || "Échec de connexion";
      etatEl.innerHTML = `<span class="tlx-cross">❌</span>`;
    }
  }

  /* ============================================================
     tenter(service, options)
     - service : "google" | "supabase" | "github"
     - options.conteneur : élément DOM où afficher (optionnel)
     - options.test : fonction async qui retourne true/false
       (branche ici ta vraie logique de connexion)
     ============================================================ */
  async function tenter(service, options = {}) {
    const box = creerBoite(service, options.conteneur);
    setEtat(box, "loading");

    try {
      let ok;
      if (typeof options.test === "function") {
        ok = await options.test();          // vraie logique fournie par toi
      } else {
        // simulation de démo (remplace par ta vraie connexion)
        await new Promise(r => setTimeout(r, 1500));
        ok = Math.random() > 0.2;
      }
      setEtat(box, ok ? "ok" : "err",
              ok ? `Connecté à ${NOMS[service]}` : `Impossible de joindre ${NOMS[service]}`);
      return { service, ok, box };
    } catch (e) {
      setEtat(box, "err", `Erreur : ${e.message}`);
      return { service, ok: false, box, erreur: e };
    }
  }

  // --- Tente plusieurs services d'affilée ---
  async function tenterPlusieurs(services, options = {}) {
    const res = [];
    for (const s of services) res.push(await tenter(s, options));
    return res;
  }

  return { tenter, tenterPlusieurs, creerBoite, setEtat, LOGOS };
})();

// Expose global
window.TilexConnect = TilexConnect;
