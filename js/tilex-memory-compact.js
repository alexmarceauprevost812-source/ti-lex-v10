// ============================================
// js/tilex-memory-compact.js
// Ti-lex-AL v10 — Compactage / résumé de conversations
// Auteur: Alex Marceau-Prévost
// Aligné sur l'app : client supabase (RLS, par utilisateur) + ai-proxy
// ============================================

const TilexMemoryCompact = {

  table: 'tilex_conversations',
  tableResume: 'tilex_resumes',

  _sb() { return window.supabase || null; },
  _aiProxy() { return (window.AI_PROXY || ((window.SB_URL || '') + '/functions/v1/ai-proxy')); },
  _token() {
    try { const r = localStorage.getItem('sb-rnuripmfozlxenryxhdc-auth-token'); if (r) { const s = JSON.parse(r); if (s && s.access_token) return s.access_token; } } catch (e) {}
    return window.SB_ANON || '';
  },
  async _uid() {
    const sb = this._sb(); if (!sb) return null;
    try { const r = await sb.auth.getUser(); return (r && r.data && r.data.user && r.data.user.id) || null; } catch (e) { return null; }
  },
  _esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; },

  // ─── UTILITAIRES CONV ID ──────────────────
  getConvId() {
    let id = localStorage.getItem('tilex_conv_id');
    if (!id) { id = 'conv_' + Date.now(); localStorage.setItem('tilex_conv_id', id); }
    return id;
  },
  nouvelleConversation() {
    const id = 'conv_' + Date.now();
    localStorage.setItem('tilex_conv_id', id);
    localStorage.removeItem('tilex_contexte_actif');
    console.log('[Compact] 🆕 Nouvelle conversation:', id);
    return id;
  },
  getContexteActif() { return localStorage.getItem('tilex_contexte_actif') || ''; },

  // ─── 1. SAUVEGARDER UN MESSAGE ────────────
  async sauvegarderMessage(role, contenu) {
    const sb = this._sb(); if (!sb) return;
    const uid = await this._uid(); if (!uid) return;
    try {
      await sb.from(this.table).insert([{ user_id: uid, conv_id: this.getConvId(), role, contenu, created_at: new Date().toISOString() }]);
    } catch (e) { console.warn('[Compact] save msg:', e.message); }
  },

  // ─── 2. CHARGER LES MESSAGES D'UNE CONVO ──
  async chargerMessages(convId) {
    const sb = this._sb(); if (!sb) return [];
    const uid = await this._uid(); if (!uid) return [];
    const { data, error } = await sb.from(this.table).select('*')
      .eq('user_id', uid).eq('conv_id', convId || this.getConvId())
      .order('created_at', { ascending: true });
    return error ? [] : (data || []);
  },

  // ─── 3. APPEL IA (ai-proxy, streaming) ────
  async appelClaude(prompt) {
    const res = await fetch(this._aiProxy(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this._token(), 'apikey': (window.SB_ANON || '') },
      body: JSON.stringify({
        kind: 'chat', model: 'claude-sonnet-4-6', max_tokens: 600,
        system: "Tu es un assistant de mémoire. Résume la conversation en 10 lignes max : points clés, décisions importantes, contexte technique. Précis et concis, en français québécois.",
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok || !res.body) { let t = ''; try { t = await res.text(); } catch (e) {} throw new Error('IA ' + res.status + ' ' + t); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', plein = '';
    while (true) {
      const ch = await reader.read(); if (ch.done) break;
      buf += dec.decode(ch.value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() || '';
      for (const p of parts) {
        const ln = p.split('\n').find(l => l.indexOf('data:') === 0); if (!ln) continue;
        const d = ln.slice(5).trim(); if (d === '[DONE]') continue;
        try { const o = JSON.parse(d); if (o.type === 'content_block_delta' && o.delta && o.delta.text) plein += o.delta.text; } catch (e) {}
      }
    }
    return plein;
  },

  // ─── 4. COMPACTER = RÉSUMÉ AUTO ───────────
  // depuis la table (convId), OU directement depuis un historique en mémoire
  async compacterConversation(convId) {
    convId = convId || this.getConvId();
    const messages = await this.chargerMessages(convId);
    if (!messages.length) { console.warn('[Compact] Aucun message à compacter.'); return null; }
    return this._resumerEtSauver(convId, messages.map(m => ({ role: m.role, content: m.contenu })), messages.length);
  },
  // pratique : compacte l'historique vivant du chat (window.chatHistory)
  async compacterDepuisChat(history) {
    history = history || window.chatHistory || [];
    history = history.filter(m => typeof m.content === 'string');
    if (!history.length) { console.warn('[Compact] Historique vide.'); return null; }
    return this._resumerEtSauver(this.getConvId(), history, history.length);
  },
  async _resumerEtSauver(convId, history, nb) {
    const texte = history.map(m => `${m.role === 'user' ? 'Ti-lex' : 'IA'}: ${m.content}`).join('\n');
    let resume;
    try { resume = await this.appelClaude('CONVERSATION:\n' + texte + '\n\nRÉSUMÉ:'); }
    catch (e) { console.error('[Compact] résumé:', e.message); return null; }
    const sb = this._sb(); const uid = await this._uid();
    if (sb && uid && resume) {
      try { await sb.from(this.tableResume).insert([{ user_id: uid, conv_id: convId, resume, nb_messages: nb, created_at: new Date().toISOString() }]); }
      catch (e) { console.warn('[Compact] save résumé:', e.message); }
    }
    localStorage.setItem('tilex_contexte_actif', resume || '');
    if (window.TilexContext && resume) TilexContext.setMemoire(resume);
    console.log('✅ [Compact] Conversation compactée.');
    return resume;
  },

  // ─── 5. CONTINUER UNE CONVERSATION ────────
  async continuerConversation(convId) {
    const sb = this._sb(); if (!sb) return null;
    const uid = await this._uid(); if (!uid) return null;
    const { data } = await sb.from(this.tableResume).select('*')
      .eq('user_id', uid).eq('conv_id', convId).order('created_at', { ascending: false }).limit(1);
    if (!data || !data.length) { console.warn('[Compact] Aucun résumé pour cette conversation.'); return null; }
    const resume = data[0].resume;
    localStorage.setItem('tilex_contexte_actif', resume);
    localStorage.setItem('tilex_conv_id', convId);
    if (window.TilexContext) TilexContext.setMemoire(resume);
    console.log('🔄 [Compact] Contexte rechargé.');
    return resume;
  },

  // ─── 6. LISTER LES CONVERSATIONS (XSS-safe) ─
  async listerConversations() {
    const sb = this._sb(); if (!sb) return [];
    const uid = await this._uid(); if (!uid) return [];
    const { data } = await sb.from(this.tableResume).select('*')
      .eq('user_id', uid).order('created_at', { ascending: false });
    const arr = data || [];
    const panel = document.getElementById('tilex-conv-panel');
    if (panel) {
      panel.innerHTML = '';
      arr.forEach(c => {
        const item = document.createElement('div'); item.className = 'tilex-conv-item';
        const date = document.createElement('span'); date.className = 'conv-date';
        date.textContent = new Date(c.created_at).toLocaleDateString('fr-CA');
        const p = document.createElement('p'); p.className = 'conv-resume';
        p.textContent = String(c.resume || '').substring(0, 80) + '…';
        const btn = document.createElement('button'); btn.className = 'btn-continuer'; btn.textContent = '🔄 Continuer';
        btn.addEventListener('click', () => this.continuerConversation(c.conv_id));
        item.appendChild(date); item.appendChild(p); item.appendChild(btn);
        panel.appendChild(item);
      });
    }
    return arr;
  }

};

window.TilexMemoryCompact = TilexMemoryCompact;
console.log('✅ TilexMemoryCompact chargé — ti-lex-AL v10 (par utilisateur, RLS, ai-proxy)');
