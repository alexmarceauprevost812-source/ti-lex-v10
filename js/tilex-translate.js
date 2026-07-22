// ============================================================
// tilex-translate.js — Pouvoir magique #10 : Traduction terrain live
// ti-lex-AL v10 — Auteur : Alex Marceau-Prévost
// Texte → Texte via Claude (Anthropic, zéro OpenAI)
// Backend : edge function Supabase « translate » (clé côté serveur).
// ============================================================

const TilexTranslate = {
  // Endpoint : route serverless Vercel (la clé Anthropic reste côté serveur).
  // api/translate.js appelle Claude, avec repli auto sur l'edge function Supabase.
  apiUrl: '/api/translate',

  // Langues supportées
  langues: {
    'fr-CA': '🇨🇦 Français (Québec)',
    'en':    '🇬🇧 Anglais',
    'es':    '🇪🇸 Espagnol',
    'pt':    '🇵🇹 Portugais',
    'fr':    '🇫🇷 Français (France)'
  },

  // Langue source / cible par défaut
  source: 'fr-CA',
  cible:  'en',

  _headers() {
    var h = { 'Content-Type': 'application/json' };
    try {
      if (typeof window !== 'undefined' && window.SB_ANON) { h.apikey = window.SB_ANON; h.Authorization = 'Bearer ' + window.SB_ANON; }
      if (typeof window !== 'undefined' && typeof window.getToken === 'function') {
        var t = window.getToken(); if (t) h.Authorization = 'Bearer ' + t;
      }
    } catch (e) {}
    return h;
  },

  // ---------- Traduction principale ----------
  async traduire(texte, source = this.source, cible = this.cible) {
    if (!texte || !texte.trim()) {
      return { ok: false, erreur: 'Texte vide' };
    }

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          texte: texte.trim(),
          source: this.langues[source] || source,
          cible:  this.langues[cible]  || cible
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, erreur: data.erreur || `Serveur : ${res.status}` };
      }
      return { ok: true, traduction: data.traduction || '' };

    } catch (e) {
      return { ok: false, erreur: e.message };
    }
  },

  // ---------- Inverser source ↔ cible ----------
  inverser() {
    [this.source, this.cible] = [this.cible, this.source];
    this._majSelecteurs();
  },

  // ---------- Construire l'interface dans un conteneur ----------
  monter(conteneurId = 'tilex-translate') {
    const box = document.getElementById(conteneurId);
    if (!box) {
      console.warn(`TilexTranslate : conteneur #${conteneurId} introuvable`);
      return;
    }

    const opts = (sel) => Object.entries(this.langues)
      .map(([code, nom]) =>
        `<option value="${code}" ${sel === code ? 'selected' : ''}>${nom}</option>`)
      .join('');

    box.innerHTML = `
      <div class="tt-wrap">
        <div class="tt-langs">
          <select id="tt-source">${opts(this.source)}</select>
          <button id="tt-swap" title="Inverser">⇄</button>
          <select id="tt-cible">${opts(this.cible)}</select>
        </div>
        <textarea id="tt-input" placeholder="Écris en québécois icitte..."></textarea>
        <button id="tt-go">🌐 Traduire</button>
        <div id="tt-output" class="tt-output"></div>
        <button id="tt-copy" class="tt-copy" style="display:none">📋 Copier</button>
      </div>
    `;

    this._brancherEvents();
    this._injecterStyle();
  },

  // ---------- Brancher les boutons ----------
  _brancherEvents() {
    const $ = (id) => document.getElementById(id);

    $('tt-swap').onclick = () => this.inverser();

    $('tt-source').onchange = (e) => { this.source = e.target.value; };
    $('tt-cible').onchange  = (e) => { this.cible  = e.target.value; };

    $('tt-go').onclick = async () => {
      const input = $('tt-input').value;
      const out   = $('tt-output');
      const btn   = $('tt-go');
      const copy  = $('tt-copy');

      out.textContent = '⏳ Traduction en cours...';
      copy.style.display = 'none';
      btn.disabled = true;

      const r = await this.traduire(input);

      btn.disabled = false;

      if (r.ok) {
        out.textContent = r.traduction;
        copy.style.display = 'inline-block';
      } else {
        out.textContent = '❌ ' + r.erreur;
      }
    };

    $('tt-copy').onclick = () => {
      navigator.clipboard.writeText($('tt-output').textContent);
      const c = $('tt-copy');
      const t = c.textContent;
      c.textContent = '✅ Copié!';
      setTimeout(() => { c.textContent = t; }, 1500);
    };
  },

  // ---------- Mettre à jour les <select> après inversion ----------
  _majSelecteurs() {
    const s = document.getElementById('tt-source');
    const c = document.getElementById('tt-cible');
    if (s) s.value = this.source;
    if (c) c.value = this.cible;
  },

  // ---------- Style (thème sombre, mobile-first) ----------
  _injecterStyle() {
    if (document.getElementById('tt-style')) return;
    const st = document.createElement('style');
    st.id = 'tt-style';
    st.textContent = `
      .tt-wrap { max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .tt-langs { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
      .tt-langs select { flex: 1; padding: 10px; border-radius: 10px; background: #1a1a1a; color: #eee; border: 1px solid #333; font-size: 15px; }
      #tt-swap { background: #e63946; color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-size: 18px; cursor: pointer; }
      #tt-input { width: 100%; min-height: 110px; padding: 12px; border-radius: 12px; background: #1a1a1a; color: #eee; border: 1px solid #333; font-size: 16px; resize: vertical; box-sizing: border-box; }
      #tt-go { width: 100%; margin-top: 10px; padding: 14px; border: none; border-radius: 12px; background: #e63946; color: #fff; font-size: 16px; font-weight: bold; cursor: pointer; }
      #tt-go:disabled { opacity: .6; }
      .tt-output { margin-top: 14px; padding: 14px; border-radius: 12px; background: #141414; color: #4ade80; border: 1px solid #2a2a2a; min-height: 40px; font-size: 16px; white-space: pre-wrap; }
      .tt-copy { margin-top: 8px; padding: 8px 14px; border: none; border-radius: 10px; background: #333; color: #eee; cursor: pointer; }
    `;
    document.head.appendChild(st);
  }
};

// Auto-montage si le conteneur existe déjà dans la page
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tilex-translate')) {
      TilexTranslate.monter();
    }
  });
}

// Export global
if (typeof window !== 'undefined') window.TilexTranslate = TilexTranslate;
