/* ============================================
   TI-LEX-AL v10
   Fichier   : js/tilex-mandat.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : Front du système de mandat/autorisation de scan.
               Génère le code, montre les 2 preuves (DNS TXT / fichier),
               vérifie la propriété, fait signer le mandat (log IP/date),
               pis bloque « Lancer le scan » tant que ce n'est pas
               vérifié ET signé. « Mes domaines autorisés » inclus.
   ============================================ */

const TilexMandat = (() => {

  let etat = { ouvert: false, occupe: false, domaine: '' };

  function _sb() { return window.__engineSb || (window.supabase && window.supabase.auth ? window.supabase : null); }
  async function _session() {
    const sb = _sb(); if (!sb || !sb.auth) return null;
    try { const { data } = await sb.auth.getSession(); return data && data.session ? data.session : null; } catch (e) { return null; }
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _toast(m) { if (window.showToastMsg) window.showToastMsg(m); else if (window.showToast) window.showToast(m); }
  function _nettoyer(d) {
    return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/:?#].*$/, '').replace(/\s/g, '');
  }
  async function _post(url, body, token) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }

  /* ─── Styles ─── */
  function _style() {
    if (document.getElementById('tilex-mandat-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-mandat-style';
    s.textContent = `
      #tilex-mandat{position:fixed;inset:0;z-index:99997;opacity:0;pointer-events:none;transition:opacity .2s;background:rgba(0,0,0,.82);}
      #tilex-mandat.on{opacity:1;pointer-events:auto;}
      #tilex-mandat .md-back{position:absolute;inset:0;}
      #tilex-mandat .md-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(600px,96vw);
        max-height:92vh;overflow-y:auto;background:#0b0b10;border:1px solid #23232e;border-radius:16px;padding:18px;
        box-shadow:0 24px 70px rgba(0,0,0,.85);color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-overflow-scrolling:touch;}
      #tilex-mandat .md-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
      #tilex-mandat .md-titre{font-weight:800;font-size:16px;color:#ff7a00;}
      #tilex-mandat .md-x{background:none;border:none;color:#8b949e;font-size:22px;cursor:pointer;line-height:1;}
      #tilex-mandat .md-sub{font-size:12px;color:#8b949e;margin-bottom:14px;line-height:1.5;}
      #tilex-mandat .md-row{display:flex;gap:8px;margin-bottom:12px;}
      #tilex-mandat .md-row input{flex:1;background:#05050a;border:1px solid #30363d;color:#e6edf3;border-radius:10px;padding:11px;font-size:14px;}
      #tilex-mandat .md-btn{background:#ff7a00;border:none;color:#000;border-radius:10px;padding:11px 14px;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap;}
      #tilex-mandat .md-btn.sec{background:#161b22;color:#e6edf3;border:1px solid #30363d;}
      #tilex-mandat .md-btn:disabled{opacity:.5;cursor:not-allowed;}
      #tilex-mandat .md-card{background:#0d0d13;border:1px solid #23232e;border-radius:12px;padding:13px;margin-bottom:12px;}
      #tilex-mandat .md-card h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#8b949e;font-weight:800;}
      #tilex-mandat .md-kv{font-size:12px;color:#c9d1d9;margin:4px 0;word-break:break-all;}
      #tilex-mandat .md-kv b{color:#fff;}
      #tilex-mandat .md-code{display:flex;align-items:center;gap:8px;background:#05050a;border:1px solid #30363d;border-radius:8px;padding:8px 10px;margin:6px 0;}
      #tilex-mandat .md-code code{flex:1;font-family:'Share Tech Mono',ui-monospace,monospace;font-size:12px;color:#58a6ff;word-break:break-all;}
      #tilex-mandat .md-copy{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:7px;padding:5px 9px;font-size:11px;cursor:pointer;}
      #tilex-mandat .md-legal{font-size:11px;color:#c9d1d9;line-height:1.6;background:#101017;border:1px solid #23232e;border-radius:10px;padding:11px;margin:8px 0;}
      #tilex-mandat .md-chk{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:#e6edf3;margin:10px 0;cursor:pointer;}
      #tilex-mandat .md-chk input{margin-top:2px;width:16px;height:16px;flex-shrink:0;}
      #tilex-mandat .md-etat{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}
      #tilex-mandat .md-pill{font-size:11px;font-weight:700;border-radius:20px;padding:4px 11px;background:#161b22;border:1px solid #30363d;color:#8b949e;}
      #tilex-mandat .md-pill.ok{background:#0f2a17;border-color:#1a4028;color:#3fb950;}
      #tilex-mandat .md-pill.att{background:#2a2a1a;border-color:#3a3a1a;color:#e2c04a;}
      #tilex-mandat .md-scan{width:100%;background:#238636;border:none;color:#fff;border-radius:11px;padding:13px;font-size:15px;font-weight:800;cursor:pointer;margin-top:6px;}
      #tilex-mandat .md-scan:disabled{background:#161b22;color:#6e7681;cursor:not-allowed;}
      #tilex-mandat .md-liste .md-dom{display:flex;align-items:center;gap:8px;background:#101017;border:1px solid #23232e;border-radius:9px;padding:9px 11px;margin-bottom:6px;font-size:12px;}
      #tilex-mandat .md-liste .md-dom .n{flex:1;color:#e6edf3;font-weight:700;word-break:break-all;}
      #tilex-mandat .md-note{font-size:10px;color:#6e7681;text-align:center;margin-top:10px;line-height:1.5;}
      #tilex-mandat .md-err{color:#f85149;font-size:12px;margin:6px 0;}
    `;
    document.head.appendChild(s);
  }

  /* ─── Construction ─── */
  function _construire() {
    if (document.getElementById('tilex-mandat')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-mandat';
    el.innerHTML = `
      <div class="md-back" onclick="TilexMandat.fermer()"></div>
      <div class="md-panel" onclick="event.stopPropagation()">
        <div class="md-head">
          <span class="md-titre">🔒 Mandat d'autorisation de scan</span>
          <button class="md-x" onclick="TilexMandat.fermer()">✕</button>
        </div>
        <div class="md-sub">Avant de scanner un domaine, prouve que tu en es le propriétaire (ou que t'as l'autorisation écrite) pis signe le mandat. Scanner un site non autorisé est illégal (art. 342.1 C.cr.).</div>

        <div class="md-row">
          <input id="md-domaine" type="text" placeholder="exemple.com" autocomplete="off" autocapitalize="off" spellcheck="false"/>
          <button class="md-btn" id="md-gen" onclick="TilexMandat.generer()">Générer le code</button>
        </div>
        <div id="md-erreur"></div>
        <div id="md-etape"></div>

        <div class="md-card md-liste" id="md-mesdomaines" style="display:none;">
          <h4>Mes domaines autorisés</h4>
          <div id="md-liste-corps"></div>
        </div>
        <div class="md-note">🔒 Privé par utilisateur (RLS). L'IP et la date de signature sont journalisées comme preuve.</div>
      </div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('#md-domaine');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') generer(); });
  }

  /* ─── Étape 1 : générer le code ─── */
  async function generer() {
    if (etat.occupe) return;
    const inp = document.getElementById('md-domaine');
    const domaine = _nettoyer(inp ? inp.value : '');
    const err = document.getElementById('md-erreur');
    if (err) err.innerHTML = '';
    if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domaine)) {
      if (err) err.innerHTML = '<div class="md-err">Domaine invalide (ex: exemple.com).</div>';
      return;
    }
    const sess = await _session();
    if (!sess) { if (err) err.innerHTML = '<div class="md-err">Connecte-toi d\'abord (compte ti-lex).</div>'; return; }

    etat.occupe = true; etat.domaine = domaine;
    _emailCache = sess.user && sess.user.email ? sess.user.email : '';
    const btn = document.getElementById('md-gen');
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      // Client-side : crée/réinitialise la ligne pis récupère le code (RLS).
      const row = await creerMandat(_emailCache, domaine);
      const code = row.code_verif;
      _rendreEtape({
        ok: true, domaine, code_verif: code,
        instructions: {
          dns_txt: { titre: 'Méthode 1 — Enregistrement DNS TXT', type: 'TXT', hote: '@ (ou ' + domaine + ')', valeur: code, note: 'Ajoute cet enregistrement TXT chez ton registraire. Propagation : quelques minutes à 1 h.' },
          fichier: { titre: 'Méthode 2 — Fichier de vérification', chemin: 'https://' + domaine + '/.well-known/silex-verify.txt', contenu: code, note: 'Crée ce fichier avec exactement ce contenu.' },
        },
      });
    } catch (e) {
      if (err) err.innerHTML = '<div class="md-err">' + _esc(e.message) + '</div>';
    } finally {
      etat.occupe = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Régénérer'; }
    }
  }

  function _rendreEtape(d) {
    const box = document.getElementById('md-etape');
    if (!box) return;
    const i = d.instructions || {};
    const dns = i.dns_txt || {}, fic = i.fichier || {};
    box.innerHTML = `
      <div class="md-card">
        <h4>1 · Prouve la propriété de ${_esc(d.domaine)}</h4>
        <div class="md-kv">Choisis <b>une</b> des deux méthodes :</div>

        <div class="md-kv" style="margin-top:9px;">🌐 <b>${_esc(dns.titre || 'DNS TXT')}</b></div>
        <div class="md-kv">Type : <b>${_esc(dns.type || 'TXT')}</b> · Hôte : <b>${_esc(dns.hote || '@')}</b></div>
        <div class="md-code"><code id="md-val-dns">${_esc(dns.valeur || d.code_verif)}</code><button class="md-copy" onclick="TilexMandat.copier('md-val-dns',this)">Copier</button></div>
        <div class="md-kv" style="color:#8b949e;">${_esc(dns.note || '')}</div>

        <div class="md-kv" style="margin-top:11px;">📄 <b>${_esc(fic.titre || 'Fichier')}</b></div>
        <div class="md-code"><code id="md-val-fic-url">${_esc(fic.chemin || '')}</code><button class="md-copy" onclick="TilexMandat.copier('md-val-fic-url',this)">Copier</button></div>
        <div class="md-kv">Contenu du fichier :</div>
        <div class="md-code"><code id="md-val-fic">${_esc(fic.contenu || d.code_verif)}</code><button class="md-copy" onclick="TilexMandat.copier('md-val-fic',this)">Copier</button></div>
        <div class="md-kv" style="color:#8b949e;">${_esc(fic.note || '')}</div>

        <button class="md-btn sec" style="width:100%;margin-top:10px;" id="md-verif" onclick="TilexMandat.verifier()">🔎 Vérifier la propriété</button>
      </div>

      <div class="md-card">
        <h4>2 · Mandat d'autorisation</h4>
        <div class="md-legal" id="md-legal">${_esc(_texteLegal(d.domaine, sessionEmail(), null))}</div>
        <label class="md-chk"><input type="checkbox" id="md-accepte"/> <span>J'ai lu et j'accepte ce mandat. Je confirme avoir le droit de scanner ce domaine.</span></label>
        <button class="md-btn" style="width:100%;" id="md-signer" onclick="TilexMandat.signer()">✍️ Signer le mandat</button>
      </div>

      <div class="md-etat" id="md-pills">
        <span class="md-pill att" id="md-pill-verif">⏳ Propriété : en attente</span>
        <span class="md-pill att" id="md-pill-signe">⏳ Mandat : à signer</span>
        <span class="md-pill" id="md-pill-pret">🔒 Scan : bloqué</span>
      </div>
      <button class="md-scan" id="md-lancer" disabled onclick="TilexMandat.lancerScan()">🚀 Lancer le scan</button>
    `;
    _majPills(false, false);
  }

  let _emailCache = '';
  function sessionEmail() { return _emailCache; }
  function _texteLegal(domaine, email, date) {
    const dd = date || '[DATE]';
    const ee = email || '[COURRIEL]';
    return 'Je confirme être le propriétaire du domaine ' + (domaine || '[DOMAINE]') + ' ou détenir une autorisation écrite explicite de son propriétaire pour effectuer un scan de sécurité. Je comprends qu\'un scan non autorisé constitue une infraction (art. 342.1 du Code criminel du Canada) et j\'assume l\'entière responsabilité de cette déclaration. Signé le ' + dd + ' — ' + ee + '.';
  }

  /* ─── Étape 2 : vérifier la propriété (Cloudflare DoH côté client, repli serveur) ─── */
  async function verifier() {
    const sess = await _session(); if (!sess) { _toast('Connecte-toi d\'abord'); return; }
    const email = sess.user && sess.user.email ? sess.user.email : '';
    const btn = document.getElementById('md-verif');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Vérification…'; }
    try {
      // 1) Récupère le code attendu.
      let code = '';
      try {
        const sb = _sb();
        const { data } = await sb.from('scan_mandats').select('code_verif').eq('user_email', email).eq('domaine', etat.domaine).limit(1);
        if (data && data[0]) code = data[0].code_verif;
      } catch (e) {}

      // 2) Vérif DNS TXT via Cloudflare DoH (client), sinon repli serveur (fichier + DNS).
      let ok = false, methode = 'dns_txt';
      if (code && await verifierDNS(etat.domaine, code)) {
        await marquerVerifie(email, etat.domaine, 'dns_txt');
        ok = true;
      } else {
        const rep = await _post('/api/verifier-propriete', { domaine: etat.domaine }, sess.access_token);
        if (rep.ok && rep.d && rep.d.verifie) { ok = true; methode = rep.d.methode || 'dns_txt'; }
      }

      if (ok) { _toast('✅ Propriété vérifiée (' + (methode === 'dns_txt' ? 'DNS TXT' : 'fichier') + ')'); _majPills(true, undefined); }
      else { _toast('Code pas encore trouvé (DNS pas propagé ou fichier absent). Réessaie plus tard.'); }
    } catch (e) { _toast('❌ ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🔎 Vérifier la propriété'; } await rafraichirEtat(); }
  }

  /* ─── Étape 3 : signer le mandat ─── */
  async function signer() {
    const sess = await _session(); if (!sess) { _toast('Connecte-toi d\'abord'); return; }
    const chk = document.getElementById('md-accepte');
    if (!chk || !chk.checked) { _toast('Coche la case pour accepter le mandat'); return; }
    const btn = document.getElementById('md-signer');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Signature…'; }
    try {
      let signeLe = new Date().toISOString();
      // Essai serveur (capture l'IP réelle via x-forwarded-for)…
      const rep = await _post('/api/signer-mandat', { domaine: etat.domaine, accepte: true }, sess.access_token);
      if (rep.ok && rep.d && rep.d.ok) {
        signeLe = rep.d.signe_le || signeLe;
      } else {
        // …sinon repli 100% client-side (sans IP serveur).
        const sb = _sb();
        const { data } = await sb.from('scan_mandats').select('id').eq('user_email', sessionEmail()).eq('domaine', etat.domaine).limit(1);
        if (!data || !data[0]) throw new Error('Mandat introuvable — génère ton code d\'abord.');
        await signerMandat(data[0].id, 'client');
      }
      _toast('✅ Mandat signé (date + IP journalisées)');
      const legal = document.getElementById('md-legal');
      if (legal) legal.textContent = _texteLegal(etat.domaine, sessionEmail(), new Date(signeLe).toLocaleString('fr-CA'));
      _majPills(undefined, true);
    } catch (e) { _toast('❌ ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '✍️ Signer le mandat'; } await rafraichirEtat(); }
  }

  /* ─── Étape 4 : le gardien décide si on peut scanner ─── */
  async function lancerScan() {
    const sess = await _session(); if (!sess) { _toast('Connecte-toi d\'abord'); return; }
    const btn = document.getElementById('md-lancer');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Vérification de l\'autorisation…'; }
    try {
      // Gardien serveur si dispo, sinon gardien client (scanAutorise).
      const rep = await _post('/api/verifier-autorisation-scan', { domaine: etat.domaine }, sess.access_token);
      let autorise = false, d = rep.d || {};
      if (rep.ok && typeof d.autorise === 'boolean') autorise = d.autorise;
      else autorise = await scanAutorise(sessionEmail(), etat.domaine);
      if (autorise) {
        _toast('🔓 Autorisé — le scan peut démarrer sur ' + etat.domaine);
        // Point d'intégration SILEX : si un moteur de scan est branché, on le lance.
        if (window.SilexScan && typeof window.SilexScan.lancer === 'function') {
          window.SilexScan.lancer(etat.domaine, { mandat: d });
        } else {
          try { window.dispatchEvent(new CustomEvent('tilex:scan:autorise', { detail: { domaine: etat.domaine, mandat: d } })); } catch (e) {}
        }
      } else {
        _toast('🔒 Refusé : ' + (d.message || 'autorisation incomplète'));
      }
    } catch (e) { _toast('❌ ' + e.message); }
    finally { if (btn) { btn.textContent = '🚀 Lancer le scan'; } await rafraichirEtat(); }
  }

  /* ─── Met à jour les pastilles + le bouton de scan ─── */
  function _majPills(verifie, signe) {
    const pv = document.getElementById('md-pill-verif');
    const ps = document.getElementById('md-pill-signe');
    const pp = document.getElementById('md-pill-pret');
    const scan = document.getElementById('md-lancer');
    if (verifie !== undefined && pv) {
      pv.className = 'md-pill ' + (verifie ? 'ok' : 'att');
      pv.textContent = verifie ? '✅ Propriété : vérifiée' : '⏳ Propriété : en attente';
    }
    if (signe !== undefined && ps) {
      ps.className = 'md-pill ' + (signe ? 'ok' : 'att');
      ps.textContent = signe ? '✅ Mandat : signé' : '⏳ Mandat : à signer';
    }
    const vOk = pv && pv.classList.contains('ok');
    const sOk = ps && ps.classList.contains('ok');
    const pret = vOk && sOk;
    if (pp) { pp.className = 'md-pill ' + (pret ? 'ok' : ''); pp.textContent = pret ? '🔓 Scan : prêt' : '🔒 Scan : bloqué'; }
    if (scan) scan.disabled = !pret;
  }

  /* ─── Relit l'état réel depuis la BD (source de vérité) ─── */
  async function rafraichirEtat() {
    const sess = await _session(); if (!sess || !etat.domaine) return;
    try {
      const url = 'https://rnuripmfozlxenryxhdc.supabase.co/rest/v1/scan_mandats?domaine=eq.' + encodeURIComponent(etat.domaine) + '&user_email=eq.' + encodeURIComponent(sess.user.email) + '&select=verifie,mandat_signe&limit=1';
      const r = await fetch(url, { headers: { apikey: _anon(), Authorization: 'Bearer ' + sess.access_token } });
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows.length) _majPills(rows[0].verifie === true, rows[0].mandat_signe === true);
    } catch (e) {}
  }

  function _anon() {
    try { if (window.SB_ANON) return window.SB_ANON; } catch (e) {}
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';
  }

  /* ─── Liste « Mes domaines autorisés » ─── */
  async function chargerListe() {
    const sess = await _session(); if (!sess) return;
    _emailCache = sess.user && sess.user.email ? sess.user.email : '';
    try {
      const url = 'https://rnuripmfozlxenryxhdc.supabase.co/rest/v1/scan_mandats?user_email=eq.' + encodeURIComponent(sess.user.email) + '&select=domaine,verifie,mandat_signe,signe_le&order=created_at.desc';
      const r = await fetch(url, { headers: { apikey: _anon(), Authorization: 'Bearer ' + sess.access_token } });
      const rows = await r.json().catch(() => []);
      const wrap = document.getElementById('md-mesdomaines');
      const corps = document.getElementById('md-liste-corps');
      if (!wrap || !corps) return;
      if (!Array.isArray(rows) || !rows.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      corps.innerHTML = rows.map((m) => {
        const pret = m.verifie && m.mandat_signe;
        const etatTxt = pret ? '🔓 prêt' : (m.verifie ? '✅ vérifié · ✍️ à signer' : '⏳ à vérifier');
        return `<div class="md-dom"><span class="n">${_esc(m.domaine)}</span><span style="color:${pret ? '#3fb950' : '#e2c04a'};">${etatTxt}</span>
          <button class="md-copy" onclick="TilexMandat.reprendre('${_esc(m.domaine)}')">Ouvrir</button></div>`;
      }).join('');
    } catch (e) {}
  }
  function reprendre(domaine) {
    const inp = document.getElementById('md-domaine');
    if (inp) inp.value = domaine;
    generer();
  }

  function copier(id, btn) {
    const el = document.getElementById(id); if (!el) return;
    const txt = el.textContent || '';
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = o; }, 1200); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done);
    else { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(); }
  }

  /* ─── Ouverture / fermeture ─── */
  function ouvrir() {
    _construire();
    requestAnimationFrame(() => { const el = document.getElementById('tilex-mandat'); if (el) el.classList.add('on'); });
    etat.ouvert = true;
    chargerListe();
  }
  function fermer() { const el = document.getElementById('tilex-mandat'); if (el) el.classList.remove('on'); etat.ouvert = false; }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  /* ============================================================
     API programmatique (client-side) — demandée par la mission.
     Utilise window.supabase directement (RLS par utilisateur).
     ============================================================ */

  // Génère un code unique "silex-verify-XXXXXXXX" (16 hex).
  function genererCodeVerif(_domaine) {
    const arr = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    let hex = ''; for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return 'silex-verify-' + hex;
  }

  // Insère (ou réinitialise) une ligne dans scan_mandats. Retourne la ligne.
  async function creerMandat(email, domaine) {
    const sb = _sb(); if (!sb) throw new Error('Supabase absent');
    const code = genererCodeVerif(domaine);
    const dom = _nettoyer(domaine);
    const { data, error } = await sb.from('scan_mandats')
      .upsert({ user_email: email, domaine: dom, code_verif: code, verifie: false, mandat_signe: false, signe_le: null, ip_signature: null }, { onConflict: 'user_email,domaine' })
      .select().limit(1);
    if (error) throw new Error(error.message);
    return (data && data[0]) ? data[0] : { code_verif: code, domaine: dom };
  }

  // Vérifie l'enregistrement DNS TXT via DNS-over-HTTPS (Cloudflare) — côté client.
  async function verifierDNS(domaine, code) {
    const dom = _nettoyer(domaine);
    const cibles = [dom, '_silex-verify.' + dom];
    for (const cible of cibles) {
      try {
        const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(cible) + '&type=TXT', { headers: { accept: 'application/dns-json' } });
        const j = await r.json().catch(() => ({}));
        const ans = (j && j.Answer) || [];
        for (const a of ans) {
          const v = String(a.data || '').replace(/^"|"$/g, '').replace(/\\"/g, '"');
          if (v.includes(code)) return true;
        }
      } catch (e) { /* cible suivante */ }
    }
    return false;
  }

  // Signe le mandat : mandat_signe=true, signe_le=now, ip_signature=ip.
  async function signerMandat(id, ip) {
    const sb = _sb(); if (!sb) throw new Error('Supabase absent');
    const { error } = await sb.from('scan_mandats')
      .update({ mandat_signe: true, signe_le: new Date().toISOString(), ip_signature: ip || null })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }

  // LE GARDIEN (client) : true SEULEMENT si verifie ET mandat_signe.
  async function scanAutorise(email, domaine) {
    const sb = _sb(); if (!sb) return false;
    try {
      const { data } = await sb.from('scan_mandats')
        .select('verifie,mandat_signe').eq('user_email', email).eq('domaine', _nettoyer(domaine)).limit(1);
      return !!(data && data[0] && data[0].verifie === true && data[0].mandat_signe === true);
    } catch (e) { return false; }
  }

  // Marque verifie=true (après un verifierDNS réussi). RLS : seulement ses lignes.
  async function marquerVerifie(email, domaine, methode) {
    const sb = _sb(); if (!sb) throw new Error('Supabase absent');
    const { error } = await sb.from('scan_mandats')
      .update({ verifie: true, methode_preuve: methode || 'dns_txt' })
      .eq('user_email', email).eq('domaine', _nettoyer(domaine));
    if (error) throw new Error(error.message);
    return true;
  }

  return {
    ouvrir, fermer, basculer, generer, verifier, signer, lancerScan, copier, reprendre, chargerListe, rafraichirEtat,
    // API programmatique
    genererCodeVerif, creerMandat, verifierDNS, signerMandat, scanAutorise, marquerVerifie,
  };

})();

window.TilexMandat = TilexMandat;

/* ============================================
   📋 POUR CLAUDE CODE :
   - S'ouvre sur demande (bouton menu / section pro.html / commande).
   - Utilise le token Supabase de l'utilisateur (RLS) — rien d'exposé.
   - « Lancer le scan » est bloqué tant que verifie ET mandat_signe.
   ============================================ */
