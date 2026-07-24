// ============================================
// js/tilex-conv-panel.js
// Ti-lex-AL v10 — Panneau visuel conversations (tiroir latéral)
// Auteur: Alex Marceau-Prévost
// Aligné app : client supabase (RLS, par utilisateur) + TilexMemoryCompact
// ============================================

const TilexConvPanel = {

  _sb() { return window.supabase || null; },
  async _uid() {
    const sb = this._sb(); if (!sb) return null;
    try { const r = await sb.auth.getUser(); return (r && r.data && r.data.user && r.data.user.id) || null; } catch (e) { return null; }
  },
  _toast(msg, type) {
    if (window.TilexToast && TilexToast.show) TilexToast.show(msg, type || 'info');
    else if (typeof window.showToastMsg === 'function') showToastMsg(msg);
    else console.log('[ConvPanel]', msg);
  },

  // ─── INIT ─────────────────────────────────
  init() {
    if (document.getElementById('tilex-conv-panel')) return; // déjà créé
    this.creerPanel();
    console.log('✅ TilexConvPanel chargé — ti-lex-AL v10');
  },

  // ─── CRÉER LE PANNEAU (markup statique, sûr) ─
  creerPanel() {
    const panel = document.createElement('div');
    panel.id = 'tilex-conv-panel';
    panel.innerHTML =
      '<div class="tcp-header">' +
        '<span class="tcp-titre">💬 Conversations</span>' +
        '<button class="tcp-btn-new" id="tcp-new">＋ Nouvelle</button>' +
        '<button class="tcp-btn-close" id="tcp-close">✕</button>' +
      '</div>' +
      '<div class="tcp-search"><input type="text" id="tcp-search-input" placeholder="🔍 Chercher..."/></div>' +
      '<div class="tcp-liste" id="tcp-liste"></div>';
    document.body.appendChild(panel);

    const btnToggle = document.createElement('button');
    btnToggle.id = 'tilex-conv-toggle';
    btnToggle.textContent = '‹';
    btnToggle.title = 'Conversations résumées';
    btnToggle.setAttribute('aria-label', 'Ouvrir les conversations');
    document.body.appendChild(btnToggle);

    // listeners (pas d'inline onclick → pas d'injection)
    btnToggle.addEventListener('click', () => this.toggle());
    panel.querySelector('#tcp-new').addEventListener('click', () => this.nouvelleConvo());
    panel.querySelector('#tcp-close').addEventListener('click', () => this.toggle());
    panel.querySelector('#tcp-search-input').addEventListener('input', (e) => this.filtrer(e.target.value));

    this.injecterCSS();
  },

  // ─── CHARGER (client supabase, RLS) ───────
  async chargerConversations() {
    const sb = this._sb(); const uid = await this._uid();
    if (!sb || !uid) { this.afficherListe([]); return; }
    try {
      const { data } = await sb.from('tilex_resumes').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      this.afficherListe(data || []);
    } catch (err) { console.error('[ConvPanel] chargement:', err); this.afficherListe([]); }
  },

  // ─── AFFICHER LA LISTE (XSS-safe : DOM + textContent) ─
  afficherListe(convos) {
    const liste = document.getElementById('tcp-liste'); if (!liste) return;
    liste.innerHTML = '';
    if (!convos || convos.length === 0) {
      const e = document.createElement('div'); e.className = 'tcp-empty';
      e.innerHTML = '<p>Aucune conversation sauvegardée</p><small>Commence à chatter pis compacte!</small>';
      liste.appendChild(e); return;
    }
    convos.forEach(c => {
      const item = document.createElement('div'); item.className = 'tcp-item'; item.id = 'conv-' + c.conv_id;
      const hd = document.createElement('div'); hd.className = 'tcp-item-header';
      const date = document.createElement('span'); date.className = 'tcp-date'; date.textContent = this.formatDate(c.created_at);
      const nb = document.createElement('span'); nb.className = 'tcp-nb'; nb.textContent = (c.nb_messages || 0) + ' msgs';
      hd.appendChild(date); hd.appendChild(nb);
      const p = document.createElement('p'); p.className = 'tcp-resume'; p.textContent = String(c.resume || '').substring(0, 100) + '…';
      const actions = document.createElement('div'); actions.className = 'tcp-actions';
      const cont = document.createElement('button'); cont.className = 'tcp-btn-continuer'; cont.textContent = '🔄 Continuer';
      cont.addEventListener('click', () => this.continuer(c.conv_id));
      const del = document.createElement('button'); del.className = 'tcp-btn-supprimer'; del.textContent = '🗑️';
      del.addEventListener('click', () => this.supprimer(c.conv_id));
      actions.appendChild(cont); actions.appendChild(del);
      item.appendChild(hd); item.appendChild(p); item.appendChild(actions);
      liste.appendChild(item);
    });
  },

  // ─── CONTINUER ────────────────────────────
  async continuer(convId) {
    if (!window.TilexMemoryCompact) return;
    const resume = await TilexMemoryCompact.continuerConversation(convId);
    if (resume) { this.toggle(); this._toast('🔄 Conversation rechargée!', 'success'); }
    else this._toast('Aucun résumé trouvé.', 'warning');
  },

  // ─── NOUVELLE CONVERSATION ────────────────
  nouvelleConvo() {
    if (window.TilexMemoryCompact) TilexMemoryCompact.nouvelleConversation();
    this.toggle();
    this._toast('🆕 Nouvelle conversation démarrée!', 'info');
  },

  // ─── SUPPRIMER (client supabase, RLS) ─────
  async supprimer(convId) {
    if (!confirm('Supprimer cette conversation?')) return;
    const sb = this._sb(); const uid = await this._uid();
    if (sb && uid) {
      try {
        await sb.from('tilex_resumes').delete().eq('user_id', uid).eq('conv_id', convId);
        await sb.from('tilex_conversations').delete().eq('user_id', uid).eq('conv_id', convId);
      } catch (e) { console.warn('[ConvPanel] suppr:', e.message); }
    }
    const el = document.getElementById('conv-' + convId); if (el) el.remove();
    this._toast('🗑️ Conversation supprimée', 'warning');
  },

  // ─── FILTRER ──────────────────────────────
  filtrer(terme) {
    terme = (terme || '').toLowerCase();
    document.querySelectorAll('.tcp-item').forEach(item => {
      const r = item.querySelector('.tcp-resume');
      const t = r ? r.textContent.toLowerCase() : '';
      item.style.display = t.includes(terme) ? 'block' : 'none';
    });
  },

  // ─── TOGGLE ───────────────────────────────
  toggle() {
    const panel = document.getElementById('tilex-conv-panel'); if (!panel) return;
    panel.classList.toggle('tcp-ouvert');
    if (panel.classList.contains('tcp-ouvert')) this.chargerConversations();
  },

  // ─── FORMAT DATE ──────────────────────────
  formatDate(iso) {
    try { return new Date(iso).toLocaleDateString('fr-CA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  },

  // ─── CSS (accent orange ti-lex) ───────────
  injecterCSS() {
    if (document.getElementById('tcp-style')) return;
    const style = document.createElement('style'); style.id = 'tcp-style';
    style.textContent = `
      /* Petite flèche discrète collée au bord droit (plus de bulle flottante). */
      #tilex-conv-toggle{position:fixed;top:50%;right:0;transform:translateY(-50%);
        width:20px;height:52px;border-radius:10px 0 0 10px;
        background:rgba(255,107,0,.55);color:#fff;border:none;font-size:20px;line-height:1;
        cursor:pointer;z-index:9998;display:flex;align-items:center;justify-content:center;
        padding:0;opacity:.7;box-shadow:-2px 0 8px rgba(0,0,0,.25);
        transition:opacity .2s,background .2s,width .2s;}
      #tilex-conv-toggle:hover{opacity:1;background:#FF6B00;width:24px;}
      #tilex-conv-panel.tcp-ouvert ~ #tilex-conv-toggle{right:340px;}
      @media(max-width:768px){#tilex-conv-panel.tcp-ouvert ~ #tilex-conv-toggle{right:0;opacity:0;pointer-events:none;}}
      #tilex-conv-panel{position:fixed;top:0;right:-360px;width:340px;max-width:92vw;height:100dvh;background:#0f0f0f;
        border-left:1px solid #2a2a2a;z-index:99999;transition:right .3s ease;display:flex;flex-direction:column;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
      #tilex-conv-panel.tcp-ouvert{right:0;}
      .tcp-header{display:flex;align-items:center;padding:16px;background:#1a1a1a;border-bottom:1px solid #2a2a2a;gap:8px;
        padding-top:calc(16px + env(safe-area-inset-top,0px));}
      .tcp-titre{flex:1;font-weight:700;font-size:15px;color:#fff;}
      .tcp-btn-new{background:#FF6B00;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;}
      .tcp-btn-close{background:transparent;color:#888;border:none;font-size:18px;cursor:pointer;padding:4px 8px;}
      .tcp-btn-close:hover{color:#fff;}
      .tcp-search{padding:10px 16px;background:#1a1a1a;}
      #tcp-search-input{width:100%;background:#2a2a2a;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;box-sizing:border-box;}
      #tcp-search-input::placeholder{color:#666;}
      .tcp-liste{flex:1;overflow-y:auto;padding:8px;-webkit-overflow-scrolling:touch;}
      .tcp-liste::-webkit-scrollbar{width:4px;}
      .tcp-liste::-webkit-scrollbar-thumb{background:#333;border-radius:4px;}
      .tcp-item{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:12px;margin-bottom:8px;transition:border-color .2s;}
      .tcp-item:hover{border-color:#FF6B00;}
      .tcp-item-header{display:flex;justify-content:space-between;margin-bottom:6px;}
      .tcp-date{font-size:11px;color:#888;}
      .tcp-nb{font-size:11px;color:#FF6B00;background:rgba(255,107,0,.1);padding:2px 6px;border-radius:10px;}
      .tcp-resume{font-size:12px;color:#ccc;line-height:1.5;margin:0 0 10px 0;}
      .tcp-actions{display:flex;gap:8px;}
      .tcp-btn-continuer{flex:1;background:#FF6B00;color:#fff;border:none;padding:7px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .2s;}
      .tcp-btn-continuer:hover{background:#cc5600;}
      .tcp-btn-supprimer{background:#2a2a2a;color:#888;border:none;padding:7px 10px;border-radius:6px;font-size:13px;cursor:pointer;}
      .tcp-btn-supprimer:hover{color:#FF6B00;}
      .tcp-empty{text-align:center;padding:40px 20px;color:#555;}
      .tcp-empty p{font-size:14px;margin-bottom:8px;}
      .tcp-empty small{font-size:12px;}
      @media(max-width:768px){#tilex-conv-panel{width:100vw;right:-100vw;}}
    `;
    document.head.appendChild(style);
  }

};

document.addEventListener('DOMContentLoaded', () => TilexConvPanel.init());
window.TilexConvPanel = TilexConvPanel;
console.log('✅ TilexConvPanel prêt — ti-lex-AL v10 (RLS, XSS-safe)');
