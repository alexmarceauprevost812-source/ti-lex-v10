// js/tilex-youtube.js
// TilexYouTube — Recherche et affichage de vidéos YouTube pour ti-lex-AL v10
// Auteur: Alex Marceau-Prévost
//
// ⚠️ SÉCURITÉ (corrigé vs la version d'origine) :
//   1. La clé YouTube n'est JAMAIS côté client. La recherche passe par la
//      fonction Edge « youtube-search » (clé lue côté serveur dans tilex_secrets
//      ou l'env YOUTUBE_API_KEY). Le navigateur envoie juste la requête + le JWT.
//   2. Rendu 100 % DOM avec textContent → aucune injection possible depuis les
//      titres/chaînes retournés par l'API (anti-XSS).
//   3. Les IDs de vidéo sont validés (^[A-Za-z0-9_-]{11}$) avant d'être mis dans
//      l'URL de l'iframe.

const TilexYouTube = {
  maxResults: 6,

  // Injecte le style .tlyt-* une seule fois (module autonome).
  _cssFait: false,
  _injectCss() {
    if (this._cssFait || document.getElementById('tlyt-css')) { this._cssFait = true; return; }
    this._cssFait = true;
    const s = document.createElement('style');
    s.id = 'tlyt-css';
    s.textContent =
      '.tlyt-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;}'
      + '.tlyt-carte{background:#141414;border:1px solid #262626;border-radius:12px;overflow:hidden;}'
      + '.tlyt-video{position:relative;width:100%;padding-bottom:56.25%;height:0;background:#000;}'
      + '.tlyt-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}'
      + '.tlyt-titre{font-family:inherit;font-size:.85rem;font-weight:600;color:#f5f5f5;padding:10px 12px 2px;line-height:1.3;'
      + 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
      + '.tlyt-chaine{font-size:.75rem;color:#ff7a1a;padding:0 12px 12px;}'
      + '.tlyt-loading,.tlyt-vide,.tlyt-erreur{color:#8a8a8a;font-family:inherit;padding:16px;text-align:center;}'
      + '.tlyt-erreur{color:#ff4d4d;}';
    (document.head || document.documentElement).appendChild(s);
  },

  _validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id); },

  // Jeton de session existant (pro.html) — jamais de clé API ici.
  _token() {
    try { if (typeof window.getToken === 'function') return window.getToken(); } catch (e) {}
    return window.SB_ANON || '';
  },

  // Recherche des vidéos (via le proxy serveur) et les affiche dans un conteneur.
  async chercher(requete, conteneurId) {
    this._injectCss();
    const conteneur = document.getElementById(conteneurId);
    if (!conteneur) { console.error('TilexYouTube: conteneur introuvable ->', conteneurId); return; }

    const q = (requete || '').toString().trim();
    if (!q) { conteneur.textContent = ''; return; }

    conteneur.textContent = '';
    const load = document.createElement('p');
    load.className = 'tlyt-loading';
    load.textContent = '🔎 Recherche en cours…';
    conteneur.appendChild(load);

    const base = window.SB_URL;
    if (!base) { this._msg(conteneur, 'tlyt-erreur', '❌ Configuration Supabase manquante.'); return; }

    try {
      const r = await fetch(base + '/functions/v1/youtube-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.SB_ANON || '',
          'Authorization': 'Bearer ' + this._token(),
        },
        body: JSON.stringify({ query: q, max: this.maxResults }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.erreur || data.error || ('Erreur serveur ' + r.status));
      if (data.erreur) throw new Error(data.erreur);

      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) { this._msg(conteneur, 'tlyt-vide', 'Aucune vidéo trouvée. 🤷'); return; }
      this.afficher(items, conteneur);
    } catch (err) {
      console.error('TilexYouTube:', err);
      this._msg(conteneur, 'tlyt-erreur', '❌ Erreur : ' + err.message);
    }
  },

  _msg(conteneur, cls, texte) {
    conteneur.textContent = '';
    const p = document.createElement('p');
    p.className = cls; p.textContent = texte;
    conteneur.appendChild(p);
  },

  // Construit la galerie (DOM pur, textContent = anti-XSS).
  afficher(items, conteneur) {
    this._injectCss();
    conteneur.textContent = '';
    const grille = document.createElement('div');
    grille.className = 'tlyt-grille';

    items.forEach(item => {
      // Accepte le format normalisé du proxy {videoId,title,channel} OU le format brut API.
      const id = item.videoId || (item.id && item.id.videoId);
      if (!this._validId(id)) return;
      const titre = (item.title || (item.snippet && item.snippet.title) || '').toString();
      const chaine = (item.channel || (item.snippet && item.snippet.channelTitle) || '').toString();

      const carte = document.createElement('div');
      carte.className = 'tlyt-carte';

      const boite = document.createElement('div');
      boite.className = 'tlyt-video';
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id;   // id validé
      iframe.title = titre;                                          // propriété = sûr
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.setAttribute('allowfullscreen', '');
      boite.appendChild(iframe);

      const pTitre = document.createElement('p');
      pTitre.className = 'tlyt-titre'; pTitre.textContent = titre;
      const pChaine = document.createElement('p');
      pChaine.className = 'tlyt-chaine'; pChaine.textContent = '▶ ' + chaine;

      carte.appendChild(boite); carte.appendChild(pTitre); carte.appendChild(pChaine);
      grille.appendChild(carte);
    });

    conteneur.appendChild(grille);
  },

  // Affiche UNE vidéo fixe par son ID (pas besoin de clé API).
  integrerFixe(videoId, conteneurId) {
    this._injectCss();
    const conteneur = document.getElementById(conteneurId);
    if (!conteneur) return;
    if (!this._validId(videoId)) { this._msg(conteneur, 'tlyt-erreur', 'ID de vidéo invalide.'); return; }
    conteneur.textContent = '';
    const boite = document.createElement('div');
    boite.className = 'tlyt-video';
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId;
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    boite.appendChild(iframe);
    conteneur.appendChild(boite);
  },
};

// Expose globalement
window.TilexYouTube = TilexYouTube;
