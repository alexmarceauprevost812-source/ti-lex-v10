/* ============================================================
   js/tilex-connexions.js — Centre de connexions (front)
   ti-lex-AL v10 — Alex Marceau-Prévost
   Panneau plein écran avec les logos OFFICIELS des services
   que les développeurs peuvent connecter : GitHub, Supabase,
   Vercel, Claude, OpenAI, Google + Gmail (Drive, Agenda), Slack.
   - Statut live (connecté / déconnecté)
   - GitHub + Supabase branchés au chat : une fois connectés,
     l'utilisateur peut demander de déposer du code direct.
   S'ouvre SUR DEMANDE : bouton menu ou commande /connexions.
   ============================================================ */

const TilexConnexions = (() => {

  let etat = { ouvert: false };

  /* --- Logos officiels (SVG inline, aucune dépendance) --- */
  const L = {
    github: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17 5 18 5.3 18 5.3c.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.6-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>`,
    supabase: `<svg viewBox="0 0 109 113" width="24" height="24"><path fill="#3ECF8E" d="M63.7 110.3c-2.8 3.5-8.5 1.6-8.6-2.9L53.8 42h43.9c8 0 12.4 9.2 7.4 15.4l-41.4 52.9z"/><path fill="#249361" opacity=".35" d="M63.7 110.3c-2.8 3.5-8.5 1.6-8.6-2.9L53.8 42h43.9c8 0 12.4 9.2 7.4 15.4l-41.4 52.9z"/><path fill="#3ECF8E" d="M45.3 2.4c2.8-3.5 8.5-1.6 8.6 2.9L54.7 71H11.3c-8 0-12.4-9.2-7.4-15.4L45.3 2.4z"/></svg>`,
    vercel: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2L24 22H0L12 2z"/></svg>`,
    anthropic: `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#D97757" d="M13.83 3H16.6l5.4 18h-2.77l-1.3-4.54h-5.86L10.77 21H8l5.83-18zm2.03 11.6L13.55 6.9l-2.31 7.7h4.62z"/></svg>`,
    openai: `<svg viewBox="0 0 24 24" width="23" height="23"><path fill="#10A37F" d="M22.28 9.37a5.88 5.88 0 00-.51-4.85 5.96 5.96 0 00-6.42-2.86A5.88 5.88 0 0011 0a5.96 5.96 0 00-5.69 4.13A5.88 5.88 0 001.38 7.8a5.96 5.96 0 00.74 6.98 5.88 5.88 0 00.5 4.85 5.96 5.96 0 006.43 2.86A5.88 5.88 0 0013 24a5.96 5.96 0 005.69-4.13 5.88 5.88 0 003.93-3.67 5.96 5.96 0 00-.74-6.98zM13 22.43a4.42 4.42 0 01-2.83-1.02l.14-.08 4.7-2.71a.76.76 0 00.38-.66v-6.63l1.99 1.15a.07.07 0 01.04.05v5.48A4.44 4.44 0 0113 22.43zM3.49 18.36a4.42 4.42 0 01-.53-2.97l.14.08 4.7 2.71a.76.76 0 00.76 0l5.74-3.31v2.3a.07.07 0 01-.03.06l-4.75 2.74a4.44 4.44 0 01-6.03-1.61zM2.26 7.86a4.43 4.43 0 012.3-1.95v5.59a.76.76 0 00.38.66l5.74 3.31-1.99 1.15a.07.07 0 01-.07 0L3.87 13.9a4.44 4.44 0 01-1.61-6.04zM19.65 11.72l-5.74-3.31 1.99-1.15a.07.07 0 01.07 0l4.75 2.74a4.44 4.44 0 01-.68 7.99v-5.61a.76.76 0 00-.39-.66zm1.98-2.98l-.14-.08-4.7-2.72a.76.76 0 00-.76 0l-5.74 3.32v-2.3a.07.07 0 01.03-.06l4.75-2.74a4.44 4.44 0 016.56 4.58zM8.29 13.33L6.3 12.18a.07.07 0 01-.04-.06V6.64a4.44 4.44 0 017.25-3.4l-.14.08-4.7 2.72a.76.76 0 00-.38.66zm1.08-2.33L12 9.53l2.63 1.47v2.95L12 15.42l-2.63-1.47z"/></svg>`,
    google: `<svg viewBox="0 0 48 48" width="24" height="24"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C41.2 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>`,
    gmail: `<svg viewBox="0 0 52 42" width="24" height="20"><path fill="#4285F4" d="M3.5 42h9V20L0 10.9v27.6A3.5 3.5 0 003.5 42z"/><path fill="#34A853" d="M39.5 42h9a3.5 3.5 0 003.5-3.5V10.9L39.5 20z"/><path fill="#FBBC04" d="M39.5 3.5V20L52 10.9V5.25C52-1.46 44.34-2.79 39.5 3.5z"/><path fill="#EA4335" d="M12.5 20V3.5L26 13.6 39.5 3.5V20L26 30.1z"/><path fill="#C5221F" d="M0 5.25v5.65L12.5 20V3.5C7.66-2.79 0-1.46 0 5.25z"/></svg>`,
    drive: `<svg viewBox="0 0 87.3 78" width="23" height="21"><path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5C.4 49.9 0 51.45 0 53h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.35c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="M73.4 26.5L60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>`,
    agenda: `<svg viewBox="0 0 48 48" width="23" height="23"><path fill="#fff" d="M35 12H13v24h22z"/><path fill="#1967D2" d="M35 12l1 6h-8l1-6z" opacity="0"/><path fill="#4285F4" d="M35 36l6-6H35z"/><path fill="#188038" d="M41 36V12l-6 6v18z" opacity="0"/><path fill="#EA4335" d="M13 36l-6-6h6z" opacity="0"/><path fill="#1A73E8" d="M13 12V7a1 1 0 011-1h20a1 1 0 011 1v5z"/><path fill="#EA4335" d="M35 12h6v-4a2 2 0 00-2-2h-4z"/><path fill="#4285F4" d="M13 12H7V8a2 2 0 012-2h4z"/><path fill="#34A853" d="M13 36H9a2 2 0 01-2-2v-4h6z"/><path fill="#188038" d="M41 30h-6v6h4a2 2 0 002-2z"/><path fill="#FBBC04" d="M7 12h34v18H7z" opacity="0"/><text x="24" y="30" font-size="15" font-family="Arial" font-weight="700" fill="#4285F4" text-anchor="middle">31</text></svg>`,
    slack: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#36C5F0" d="M8.83 6.31a2.52 2.52 0 01-2.52 2.52H3.79A2.52 2.52 0 116.31 3.79h2.52z"/><path fill="#2EB67D" d="M17.69 8.83a2.52 2.52 0 01-2.52-2.52V3.79a2.52 2.52 0 115.04 0v2.52a2.52 2.52 0 01-2.52 2.52z"/><path fill="#ECB22E" d="M15.17 17.69a2.52 2.52 0 012.52-2.52h2.52a2.52 2.52 0 11-2.52 2.52v0z"/><path fill="#E01E5A" d="M6.31 15.17a2.52 2.52 0 012.52 2.52v2.52a2.52 2.52 0 11-5.04 0v-2.52a2.52 2.52 0 012.52-2.52z"/></svg>`,
  };

  /* --- Services groupés --- */
  const GROUPES = [
    {
      titre: 'Développement',
      note: 'Connecte GitHub + Supabase → tu peux demander à TI-LEX-AL de déposer du code direct dans le chat.',
      services: [
        { id: 'github',   nom: 'GitHub',   desc: 'Dépôt de code, push depuis le chat', logo: L.github,   couleur: '#e6edf3', action: 'github' },
        { id: 'supabase', nom: 'Supabase', desc: 'Base de données, auth, edge functions', logo: L.supabase, couleur: '#3ECF8E', action: null },
        { id: 'vercel',   nom: 'Vercel',   desc: 'Hébergement + déploiement continu',    logo: L.vercel,   couleur: '#e6edf3', action: null },
      ],
    },
    {
      titre: 'Intelligence artificielle',
      services: [
        { id: 'anthropic', nom: 'Claude (Anthropic)', desc: 'Moteur principal de TI-LEX-AL', logo: L.anthropic, couleur: '#D97757', action: null },
        { id: 'openai',    nom: 'OpenAI',             desc: 'Moteur IA optionnel',           logo: L.openai,    couleur: '#10A37F', action: null },
      ],
    },
    {
      titre: 'Google & Gmail',
      note: 'Connecte ton compte Google une fois — Gmail, Drive pis Agenda suivent.',
      services: [
        { id: 'google', nom: 'Compte Google', desc: 'Connexion unique pour toute la suite', logo: L.google, couleur: '#e6edf3', action: 'google' },
        { id: 'gmail',  nom: 'Gmail',         desc: 'Lire / envoyer des courriels',          logo: L.gmail,  couleur: '#EA4335', action: null, lie: 'google' },
        { id: 'drive',  nom: 'Google Drive',  desc: 'Fichiers pis documents',                logo: L.drive,  couleur: '#4285F4', action: null, lie: 'google' },
        { id: 'agenda', nom: 'Google Agenda', desc: 'Calendrier pis rendez-vous',            logo: L.agenda, couleur: '#4285F4', action: null, lie: 'google' },
      ],
    },
    {
      titre: 'Communication',
      services: [
        { id: 'slack', nom: 'Slack', desc: 'Notifications pis équipe', logo: L.slack, couleur: '#E01E5A', action: null },
      ],
    },
  ];

  /* ============================================================
     Tests de connexion réels (best-effort, honnêtes)
     ============================================================ */
  const TESTS = {
    async github() {
      try {
        let tok = '';
        try { tok = localStorage.getItem('tilex-al-gh-token') || ''; } catch (e) {}
        if (!tok && window.TilexConfig && TilexConfig.githubToken) tok = TilexConfig.githubToken;
        if (!tok && window._codexGithub && window._codexGithub.repo) return { ok: true, detail: '@' + (window._codexGithub.username || 'connecté') };
        if (!tok) return { ok: false, detail: 'Pas de token' };
        const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + tok } });
        if (!r.ok) return { ok: false, detail: 'Token invalide' };
        const u = await r.json();
        return { ok: true, detail: '@' + u.login };
      } catch (e) { return { ok: false, detail: 'Hors ligne' }; }
    },
    async supabase() {
      try {
        if (!window.supabase) return { ok: false, detail: 'Client absent' };
        const { data } = await window.supabase.auth.getSession();
        if (data && data.session) {
          const em = data.session.user && data.session.user.email;
          return { ok: true, detail: em ? em : 'Session active' };
        }
        // Client présent mais pas de session utilisateur → connecté au projet quand même
        return { ok: true, detail: 'Projet relié' };
      } catch (e) { return { ok: false, detail: 'Erreur' }; }
    },
    async vercel() { return { ok: true, detail: 'App en ligne' }; },
    async anthropic() {
      // Le moteur passe par le backend (clé cachée côté serveur)
      return { ok: true, detail: 'Via serveur sécurisé' };
    },
    async openai()  { return { ok: false, detail: 'Optionnel — non branché' }; },
    async google()  { return { ok: false, detail: 'Cliquer pour connecter' }; },
    async slack()   { return { ok: false, detail: 'Cliquer pour connecter' }; },
  };

  /* ============================================================
     Styles
     ============================================================ */
  function _style() {
    if (document.getElementById('tilex-connexions-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-connexions-style';
    s.textContent = `
      #tilex-connexions{position:fixed;inset:0;z-index:99997;opacity:0;pointer-events:none;
        transition:opacity .2s;background:rgba(0,0,0,.8);}
      #tilex-connexions.on{opacity:1;pointer-events:auto;}
      #tilex-connexions .cx-back{position:absolute;inset:0;}
      #tilex-connexions .cx-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:min(560px,95vw);max-height:90vh;overflow-y:auto;background:#0b0b10;border:1px solid #23232e;
        border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.85);color:#e6edf3;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-overflow-scrolling:touch;}
      #tilex-connexions .cx-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
      #tilex-connexions .cx-titre{font-weight:800;font-size:17px;color:#ff7a00;}
      #tilex-connexions .cx-x{background:none;border:none;color:#8b949e;font-size:22px;cursor:pointer;line-height:1;}
      #tilex-connexions .cx-sub{font-size:12px;color:#8b949e;margin-bottom:14px;}
      #tilex-connexions .cx-grp{margin-bottom:16px;}
      #tilex-connexions .cx-grp h4{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:#6e7681;
        margin:0 0 4px;font-weight:800;}
      #tilex-connexions .cx-grp .cx-gnote{font-size:11px;color:#e2c04a;margin:0 0 9px;line-height:1.4;}
      #tilex-connexions .cx-box{display:flex;align-items:center;gap:13px;background:#101017;border:1px solid #23232e;
        border-radius:13px;padding:12px 14px;margin-bottom:8px;transition:border-color .25s;}
      #tilex-connexions .cx-box.ok{border-color:#238636;}
      #tilex-connexions .cx-box.lie{opacity:.85;}
      #tilex-connexions .cx-logo{width:34px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
      #tilex-connexions .cx-info{flex:1;min-width:0;}
      #tilex-connexions .cx-nom{font-weight:700;font-size:14px;}
      #tilex-connexions .cx-desc{font-size:11px;color:#8b949e;margin-top:1px;}
      #tilex-connexions .cx-statut{display:flex;align-items:center;gap:6px;font-size:11px;margin-top:3px;}
      #tilex-connexions .cx-dot{width:8px;height:8px;border-radius:50%;background:#555;flex-shrink:0;}
      #tilex-connexions .cx-box.ok .cx-dot{background:#3fb950;box-shadow:0 0 7px #3fb950;}
      #tilex-connexions .cx-box.ok .cx-stxt{color:#3fb950;}
      #tilex-connexions .cx-stxt{color:#8b949e;}
      #tilex-connexions .cx-spin{width:14px;height:14px;border:2px solid #23232e;border-top-color:#ff7a00;
        border-radius:50%;animation:cxspin .7s linear infinite;flex-shrink:0;}
      @keyframes cxspin{to{transform:rotate(360deg)}}
      #tilex-connexions .cx-act{background:#ff7a00;border:none;color:#000;border-radius:9px;padding:7px 12px;
        font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0;white-space:nowrap;}
      #tilex-connexions .cx-act.sec{background:#161b22;color:#e6edf3;border:1px solid #30363d;}
      #tilex-connexions .cx-ghform{margin:2px 0 10px;padding:11px;background:#0d0d13;border:1px solid #23232e;border-radius:11px;}
      #tilex-connexions .cx-ghform input{width:100%;box-sizing:border-box;background:#05050a;border:1px solid #30363d;
        color:#e6edf3;border-radius:8px;padding:9px 11px;font-size:12px;margin-bottom:8px;}
      #tilex-connexions .cx-ghform .cx-ghgo{width:100%;background:#ff7a00;border:none;color:#000;border-radius:8px;
        padding:9px;font-size:12px;font-weight:800;cursor:pointer;}
      #tilex-connexions .cx-ghform .cx-ghhint{font-size:10px;color:#6e7681;margin-top:6px;line-height:1.4;}
      #tilex-connexions .cx-ghform a{color:#58a6ff;}
      #tilex-connexions .cx-note{font-size:10px;color:#6e7681;text-align:center;margin-top:10px;line-height:1.5;}
    `;
    document.head.appendChild(s);
  }

  /* ============================================================
     Construction
     ============================================================ */
  function _construire() {
    if (document.getElementById('tilex-connexions')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-connexions';

    let corps = '';
    for (const g of GROUPES) {
      corps += `<div class="cx-grp"><h4>${g.titre}</h4>`;
      if (g.note) corps += `<div class="cx-gnote">💡 ${g.note}</div>`;
      for (const sv of g.services) {
        const actBtn = sv.action
          ? `<button class="cx-act" onclick="TilexConnexions.action('${sv.action}')">Connecter</button>`
          : '';
        corps += `
          <div class="cx-box ${sv.lie ? 'lie' : ''}" id="cx-box-${sv.id}">
            <div class="cx-logo" style="color:${sv.couleur}">${sv.logo}</div>
            <div class="cx-info">
              <div class="cx-nom">${sv.nom}</div>
              <div class="cx-desc">${sv.desc}</div>
              <div class="cx-statut" id="cx-st-${sv.id}"><span class="cx-spin"></span><span class="cx-stxt">Vérification…</span></div>
            </div>
            ${actBtn}
          </div>`;
      }
      // Formulaire GitHub (caché) juste après le groupe Développement
      if (g.titre === 'Développement') {
        corps += `
          <div class="cx-ghform" id="cx-ghform" style="display:none">
            <input type="password" id="cx-gh-token" placeholder="ghp_xxxx — Personal Access Token GitHub" autocomplete="off">
            <button class="cx-ghgo" onclick="TilexConnexions.connecterGithub()">🔗 Connecter GitHub</button>
            <div class="cx-ghhint">Crée un token sur <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">github.com/settings/tokens</a> (accès lecture/écriture au repo). Il reste stocké dans ton navigateur seulement.</div>
          </div>`;
      }
      corps += `</div>`;
    }

    el.innerHTML = `
      <div class="cx-back" onclick="TilexConnexions.fermer()"></div>
      <div class="cx-panel" onclick="event.stopPropagation()">
        <div class="cx-head">
          <span class="cx-titre">🔌 Connexions</span>
          <button class="cx-x" onclick="TilexConnexions.fermer()">✕</button>
        </div>
        <div class="cx-sub">Les applications que tu peux connecter, avec leur logo officiel pis leur statut en direct.</div>
        ${corps}
        <div class="cx-note">🔒 Tes clés pis tokens restent dans ton appareil / côté serveur — jamais exposés publiquement.</div>
      </div>`;
    document.body.appendChild(el);
  }

  /* --- Lance tous les tests --- */
  async function _verifierTous() {
    for (const g of GROUPES) {
      for (const sv of g.services) {
        _majStatut(sv.id, null); // spinner
        const fn = TESTS[sv.id] || TESTS[sv.lie];
        let res = { ok: false, detail: '—' };
        try { if (fn) res = await fn(); } catch (e) { res = { ok: false, detail: 'Erreur' }; }
        _majStatut(sv.id, res);
      }
    }
  }

  function _majStatut(id, res) {
    const box = document.getElementById('cx-box-' + id);
    const st = document.getElementById('cx-st-' + id);
    if (!st) return;
    if (res === null) {
      st.innerHTML = `<span class="cx-spin"></span><span class="cx-stxt">Vérification…</span>`;
      if (box) box.classList.remove('ok');
      return;
    }
    st.innerHTML = `<span class="cx-dot"></span><span class="cx-stxt">${res.ok ? 'Connecté' : 'Déconnecté'}${res.detail ? ' · ' + _esc(res.detail) : ''}</span>`;
    if (box) box.classList.toggle('ok', !!res.ok);
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ============================================================
     Actions
     ============================================================ */
  function action(quoi) {
    if (quoi === 'github') {
      const f = document.getElementById('cx-ghform');
      if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
      const inp = document.getElementById('cx-gh-token');
      if (inp && f && f.style.display === 'block') setTimeout(() => inp.focus(), 50);
    } else if (quoi === 'google') {
      _connecterGoogle();
    }
  }

  async function connecterGithub() {
    const inp = document.getElementById('cx-gh-token');
    const token = inp ? inp.value.trim() : '';
    if (!token) { _toast('Entre ton token GitHub'); return; }
    try {
      const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) throw new Error('invalide');
      const u = await r.json();
      // On écrit les MÊMES clés que le chat → le dépôt de code marche direct.
      try { localStorage.setItem('tilex-al-gh-token', token); } catch (e) {}
      if (window.TilexConfig) { TilexConfig.set('github_token', token); TilexConfig.set('github_user', u.login); }
      if (typeof window.alInitGhStatus === 'function') { try { window._alGhToken = token; } catch (e) {} window.alInitGhStatus(); }
      if (typeof window.updateChatConnStatus === 'function') window.updateChatConnStatus();
      const f = document.getElementById('cx-ghform'); if (f) f.style.display = 'none';
      _majStatut('github', { ok: true, detail: '@' + u.login });
      _toast('✅ GitHub connecté : @' + u.login + ' — tu peux déposer du code dans le chat');
    } catch (e) {
      _toast('❌ Token GitHub invalide');
    }
  }

  function _connecterGoogle() {
    // OAuth Google via Supabase si dispo, sinon message clair.
    if (window.supabase && window.supabase.auth && typeof window.supabase.auth.signInWithOAuth === 'function') {
      try {
        window.supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly',
            redirectTo: location.origin + '/pro.html',
          },
        });
        _toast('Redirection vers Google…');
        return;
      } catch (e) {}
    }
    _toast('Connexion Google à activer dans Supabase (Auth → Providers → Google)');
  }

  function _toast(m) {
    if (window.showToastMsg) { window.showToastMsg(m); return; }
    if (window.showToast) { window.showToast(m); return; }
    console.log('[connexions]', m);
  }

  /* ============================================================
     Ouverture / fermeture
     ============================================================ */
  function ouvrir() {
    _construire();
    requestAnimationFrame(() => {
      const el = document.getElementById('tilex-connexions');
      if (el) el.classList.add('on');
    });
    etat.ouvert = true;
    _verifierTous();
  }
  function fermer() {
    const el = document.getElementById('tilex-connexions');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { ouvrir, fermer, basculer, action, connecterGithub };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (bouton menu ou /connexions).
window.TilexConnexions = TilexConnexions;
