// ============================================================
// ti-lex v10 — TilexConnections
// Affiche des badges de connexion avec logos SVG dans le chat.
// ============================================================
(function () {
  'use strict';

  var SERVICES = {
    supabase: {
      nom: 'Supabase',
      couleur: '#3ECF8E',
      logo: '<svg width="20" height="20" viewBox="0 0 109 113" fill="none"><path d="M63.7 110.3c-2.7 3.3-8.2 1.5-8.3-2.8l-1-56.8h37.8c6.8 0 10.6 8 6.1 13.2L63.7 110.3z" fill="#3ECF8E"/><path d="M45.3 2.7c2.7-3.3 8.2-1.5 8.3 2.8l.4 56.8H16.7c-6.8 0-10.6-8-6.1-13.2L45.3 2.7z" fill="#3ECF8E"/></svg>'
    },
    github: {
      nom: 'GitHub',
      couleur: '#fff',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>'
    },
    google: {
      nom: 'Google',
      couleur: '#4285F4',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.41l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>'
    },
    openai: {
      nom: 'OpenAI',
      couleur: '#10A37F',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#10A37F"><path d="M22.28 9.37a5.88 5.88 0 00-.51-4.85 5.96 5.96 0 00-6.42-2.86A5.88 5.88 0 0011 0a5.96 5.96 0 00-5.69 4.13A5.88 5.88 0 001.38 7.8a5.96 5.96 0 00.74 6.98 5.88 5.88 0 00.5 4.85 5.96 5.96 0 006.43 2.86A5.88 5.88 0 0013 24a5.96 5.96 0 005.69-4.13 5.88 5.88 0 003.93-3.67 5.96 5.96 0 00-.74-6.98zM13 22.43a4.42 4.42 0 01-2.83-1.02l.14-.08 4.7-2.71a.76.76 0 00.38-.66v-6.63l1.99 1.15a.07.07 0 01.04.05v5.48a4.44 4.44 0 01-4.42 4.42zm-9.51-4.07a4.42 4.42 0 01-.53-2.97l.14.08 4.7 2.71a.76.76 0 00.76 0l5.74-3.31v2.3a.07.07 0 01-.03.06l-4.75 2.74a4.44 4.44 0 01-6.03-1.61zM2.26 7.86a4.43 4.43 0 012.3-1.95l-.01.16v5.43a.76.76 0 00.38.66l5.74 3.31-1.99 1.15a.07.07 0 01-.07 0L3.87 13.9a4.44 4.44 0 01-1.61-6.04zM19.65 11.72l-5.74-3.31 1.99-1.15a.07.07 0 01.07 0l4.75 2.74a4.44 4.44 0 01-.68 7.99v-5.61a.76.76 0 00-.39-.66zm1.98-2.98l-.14-.08-4.7-2.72a.76.76 0 00-.76 0l-5.74 3.32v-2.3a.07.07 0 01.03-.06l4.75-2.74a4.44 4.44 0 016.56 4.58zM8.29 13.33L6.3 12.18a.07.07 0 01-.04-.06V6.64a4.44 4.44 0 017.25-3.4l-.14.08-4.7 2.72a.76.76 0 00-.38.66v6.63zm1.08-2.33l2.56-1.47 2.56 1.47v2.95l-2.56 1.47-2.56-1.47v-2.95z"/></svg>'
    },
    anthropic: {
      nom: 'Anthropic',
      couleur: '#D4A27F',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#D4A27F"><path d="M13.83 2H16.6l5.4 20h-2.77l-1.3-5.04h-5.86L10.77 22H8l5.83-20zm2.03 12.58L13.55 6.16l-2.31 8.42h4.62zM6.6 2H3.83L8 12.46 6.6 2z"/></svg>'
    },
    vercel: {
      nom: 'Vercel',
      couleur: '#fff',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L24 22H0L12 1z"/></svg>'
    },
    slack: {
      nom: 'Slack',
      couleur: '#E01E5A',
      logo: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M5.04 15.16a2.52 2.52 0 01-2.52 2.52A2.52 2.52 0 010 15.16a2.52 2.52 0 012.52-2.52h2.52v2.52zm1.27 0a2.52 2.52 0 012.52-2.52 2.52 2.52 0 012.52 2.52v6.32A2.52 2.52 0 018.83 24a2.52 2.52 0 01-2.52-2.52v-6.32z" fill="#E01E5A"/><path d="M8.83 5.04a2.52 2.52 0 01-2.52-2.52A2.52 2.52 0 018.83 0a2.52 2.52 0 012.52 2.52v2.52H8.83zm0 1.27a2.52 2.52 0 012.52 2.52 2.52 2.52 0 01-2.52 2.52H2.52A2.52 2.52 0 010 8.83a2.52 2.52 0 012.52-2.52h6.31z" fill="#36C5F0"/><path d="M18.96 8.83a2.52 2.52 0 012.52-2.52A2.52 2.52 0 0124 8.83a2.52 2.52 0 01-2.52 2.52h-2.52V8.83zm-1.27 0a2.52 2.52 0 01-2.52 2.52 2.52 2.52 0 01-2.52-2.52V2.52A2.52 2.52 0 0115.17 0a2.52 2.52 0 012.52 2.52v6.31z" fill="#2EB67D"/><path d="M15.17 18.96a2.52 2.52 0 012.52 2.52A2.52 2.52 0 0115.17 24a2.52 2.52 0 01-2.52-2.52v-2.52h2.52zm0-1.27a2.52 2.52 0 01-2.52-2.52 2.52 2.52 0 012.52-2.52h6.31A2.52 2.52 0 0124 15.17a2.52 2.52 0 01-2.52 2.52h-6.31z" fill="#ECB22E"/></svg>'
    }
  };

  function creerBadgeHTML(serviceId, statut) {
    var svc = SERVICES[serviceId];
    if (!svc) return '';

    var estConnecte = statut === 'connecté' || statut === 'connected' || statut === true;
    var dotColor = estConnecte ? '#37e0a0' : '#555';
    var statutTexte = estConnecte ? 'Connecté' : 'Déconnecté';
    var statutColor = estConnecte ? '#37e0a0' : '#777';

    return '<div class="tilex-connection-badge">'
      + '<span class="tilex-conn-logo">' + svc.logo + '</span>'
      + '<span class="tilex-conn-nom" style="color:' + svc.couleur + ';">' + svc.nom + '</span>'
      + '<span class="tilex-conn-statut" style="color:' + statutColor + ';">'
      + '<span class="tilex-conn-dot" style="background:' + dotColor + ';'
      + (estConnecte ? 'box-shadow:0 0 6px ' + dotColor + ';' : '') + '"></span>'
      + statutTexte + '</span></div>';
  }

  function afficherToutes(connexions, container) {
    var html = '<div class="tilex-connections-wrapper">';
    for (var key in connexions) {
      if (connexions.hasOwnProperty(key)) {
        html += creerBadgeHTML(key, connexions[key]);
      }
    }
    html += '</div>';

    if (container) {
      if (typeof container === 'string') container = document.getElementById(container);
      if (container) { container.innerHTML += html; return container; }
    }
    return html;
  }

  async function afficherDepuisProfil(containerId) {
    if (typeof supabase === 'undefined') return;
    try {
      var authRes = await supabase.auth.getUser();
      if (!authRes.data || !authRes.data.user) return;
      var uid = authRes.data.user.id;

      var res = await supabase.from('user_connections')
        .select('github_connected,supabase_connected')
        .eq('user_id', uid).maybeSingle();

      var connexions = {
        supabase: (res.data && res.data.supabase_connected) ? 'connecté' : 'déconnecté',
        github: (res.data && res.data.github_connected) ? 'connecté' : 'déconnecté'
      };

      afficherToutes(connexions, containerId);
    } catch (e) {
      console.error('[TilexConnections]', e);
    }
  }

  window.TilexConnections = {
    afficherToutes: afficherToutes,
    afficherDepuisProfil: afficherDepuisProfil,
    creerBadge: creerBadgeHTML,
    SERVICES: SERVICES
  };

})();
