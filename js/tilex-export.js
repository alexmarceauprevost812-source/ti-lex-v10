// ============================================================
// js/tilex-export.js — TilexExport v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Télécharge n'importe quel contenu + exporte une conversation
// en PDF ou en ZIP (HTML + JSON + MD), sans librairie externe.
// ============================================================

const TilexExport = {

  // ============================================================
  // TÉLÉCHARGEMENTS SIMPLES (API historique — utilisée par le Studio)
  // ============================================================
  html(contenu, nom = 'index.html') {
    this._declencher(new Blob([contenu], { type: 'text/html;charset=utf-8' }), nom);
  },
  js(contenu, nom = 'script.js') {
    this._declencher(new Blob([contenu], { type: 'text/javascript;charset=utf-8' }), nom);
  },
  css(contenu, nom = 'style.css') {
    this._declencher(new Blob([contenu], { type: 'text/css;charset=utf-8' }), nom);
  },
  texte(contenu, nom = 'fichier.txt') {
    this._declencher(new Blob([contenu], { type: 'text/plain;charset=utf-8' }), nom);
  },

  // Télécharge tout le Studio en un clic (si le Studio l'expose).
  studioComplet() {
    if (window.TilexStudio && typeof window.TilexStudio.telecharger === 'function') {
      window.TilexStudio.telecharger('ti-lex-projet.html');
    } else {
      console.warn('[TilexExport] TilexStudio.telecharger() indisponible.');
    }
  },

  // ============================================================
  // UTILITAIRES
  // ============================================================
  toast(message, type) {
    // type: 'success' | 'warn' | 'info' | 'error'
    if (window.TilexToast) {
      const t = window.TilexToast;
      if (typeof t.show === 'function') return t.show(message, type === 'warn' ? 'info' : (type || 'info'));
      if (type === 'success' && typeof t.success === 'function') return t.success(message);
      if ((type === 'error' || type === 'warn') && typeof t.error === 'function') return t.error(message);
      if (typeof t.info === 'function') return t.info(message);
    }
    console.log(`[TilexExport] ${message}`);
  },

  _timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  },

  _nomFichier(ext) {
    return `tilex-conv-${this._timestamp()}.${ext}`;
  },

  _declencher(blob, nom) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`📂 Téléchargé : ${nom}`);
  },

  // ============================================================
  // COLLECTE DES MESSAGES DE LA CONVERSATION
  // ============================================================
  collecterMessages() {
    const messages = [];

    // Cherche les bulles de chat dans le DOM.
    const bulles = document.querySelectorAll('.message, .chat-message, .msg, [data-role]');
    if (bulles.length > 0) {
      bulles.forEach((el) => {
        const role = el.dataset.role || (el.classList.contains('user') ? 'user' : 'assistant');
        const texte = el.innerText || el.textContent || '';
        if (texte.trim()) messages.push({ role, texte: texte.trim() });
      });
    }

    // Fallback : window.tilexMessages si défini.
    if (messages.length === 0 && Array.isArray(window.tilexMessages)) {
      window.tilexMessages.forEach((m) => {
        messages.push({ role: m.role || 'unknown', texte: m.content || m.texte || '' });
      });
    }

    return messages;
  },

  // ============================================================
  // EXPORT PDF (ouvre → Ctrl+P → Enregistrer en PDF)
  // ============================================================
  exporterPDF() {
    const messages = this.collecterMessages();
    if (messages.length === 0) {
      this.toast('⚠️ Aucun message trouvé à exporter.', 'warn');
      return;
    }

    const echapper = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Ti-lex-AL — Conversation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117; color: #e6edf3; padding: 40px; max-width: 800px; margin: auto;
    }
    h1 { font-size: 22px; color: #ff3c3c; margin-bottom: 6px; }
    .meta { font-size: 12px; color: #8b949e; margin-bottom: 32px; }
    .message { margin-bottom: 20px; padding: 14px 18px; border-radius: 10px; line-height: 1.6; font-size: 14px; }
    .user { background: #1c2128; border-left: 3px solid #ff3c3c; }
    .assistant { background: #161b22; border-left: 3px solid #58a6ff; }
    .role-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; opacity: 0.6; }
    .user .role-label { color: #ff3c3c; }
    .assistant .role-label { color: #58a6ff; }
    footer { margin-top: 40px; font-size: 11px; color: #8b949e; text-align: center; }
  </style>
</head>
<body>
  <h1>⚡ Ti-lex-AL v10</h1>
  <div class="meta">Exporté le ${new Date().toLocaleString('fr-CA')} | ${messages.length} messages</div>
  ${messages.map(m => `
    <div class="message ${m.role === 'user' ? 'user' : 'assistant'}">
      <div class="role-label">${m.role === 'user' ? '🧑 Toi' : '🤖 Ti-lex-AL'}</div>
      <div>${echapper(m.texte).replace(/\n/g, '<br/>')}</div>
    </div>`).join('')}
  <footer>Ti-lex-AL v10 — Alex Marceau-Prévost — Normandin, Québec</footer>
</body>
</html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => setTimeout(() => win.print(), 800);
    } else {
      // Popup bloqué : télécharge le HTML directement.
      const a = document.createElement('a');
      a.href = url;
      a.download = this._nomFichier('html');
      a.click();
      URL.revokeObjectURL(url);
    }
    this.toast('📄 PDF prêt — imprime ou sauvegarde!', 'success');
  },

  // ============================================================
  // EXPORT ZIP (JSON + MD + HTML) sans JSZip
  // ============================================================
  exporterZIP() {
    const messages = this.collecterMessages();
    if (messages.length === 0) {
      this.toast('⚠️ Aucun message trouvé à exporter.', 'warn');
      return;
    }

    const echapper = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const nomDossier = `tilex-conv-${this._timestamp()}`;

    // Fichier 1 : conversation.json
    const jsonData = JSON.stringify({
      exportedAt: new Date().toISOString(),
      platform: 'Ti-lex-AL v10',
      auteur: 'Alex Marceau-Prévost',
      messages
    }, null, 2);

    // Fichier 2 : conversation.md
    let mdData = `# Ti-lex-AL v10 — Conversation\n`;
    mdData += `> Exporté le ${new Date().toLocaleString('fr-CA')}\n\n---\n\n`;
    messages.forEach(m => {
      const label = m.role === 'user' ? '**🧑 Toi**' : '**🤖 Ti-lex-AL**';
      mdData += `### ${label}\n${m.texte}\n\n---\n\n`;
    });

    // Fichier 3 : index.html (version lisible)
    const htmlData = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Ti-lex-AL — Conversation</title>
  <style>
    body { font-family: system-ui; background:#0d1117; color:#e6edf3; padding:32px; max-width:800px; margin:auto; }
    h1 { color:#ff3c3c; }
    .msg { margin:16px 0; padding:12px 16px; border-radius:8px; }
    .user { background:#1c2128; border-left:3px solid #ff3c3c; }
    .ai { background:#161b22; border-left:3px solid #58a6ff; }
    .label { font-size:11px; opacity:.6; font-weight:700; margin-bottom:4px; }
  </style>
</head>
<body>
  <h1>⚡ Ti-lex-AL v10</h1>
  <p style="color:#8b949e;font-size:12px">Exporté le ${new Date().toLocaleString('fr-CA')} — ${messages.length} messages</p>
  ${messages.map(m => `
    <div class="msg ${m.role === 'user' ? 'user' : 'ai'}">
      <div class="label">${m.role === 'user' ? '🧑 TOI' : '🤖 TI-LEX-AL'}</div>
      <div>${echapper(m.texte).replace(/\n/g, '<br/>')}</div>
    </div>`).join('')}
</body>
</html>`;

    const fichiers = [
      { nom: `${nomDossier}/conversation.json`, contenu: jsonData },
      { nom: `${nomDossier}/conversation.md`,   contenu: mdData   },
      { nom: `${nomDossier}/index.html`,         contenu: htmlData }
    ];

    const zipBytes = this._creerZIP(fichiers);
    this._declencher(new Blob([zipBytes], { type: 'application/zip' }), `${nomDossier}.zip`);
    this.toast(`📦 ZIP téléchargé — ${fichiers.length} fichiers!`, 'success');
  },

  // ============================================================
  // GÉNÉRATEUR ZIP NATIF (stored, aucune compression) — sans JSZip
  // ============================================================
  _creerZIP(fichiers) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralDir = [];
    let offset = 0;

    const dosDate = this._dosDate(new Date());

    fichiers.forEach(({ nom, contenu }) => {
      const nomBytes = encoder.encode(nom);
      const dataBytes = encoder.encode(contenu);
      const crc = this._crc32(dataBytes);

      // Local File Header
      const lfh = new Uint8Array(30 + nomBytes.length);
      const lfhView = new DataView(lfh.buffer);
      lfhView.setUint32(0,  0x04034b50, true);
      lfhView.setUint16(4,  20, true);
      lfhView.setUint16(6,  0, true);
      lfhView.setUint16(8,  0, true);            // stored
      lfhView.setUint16(10, dosDate.time, true);
      lfhView.setUint16(12, dosDate.date, true);
      lfhView.setUint32(14, crc, true);
      lfhView.setUint32(18, dataBytes.length, true);
      lfhView.setUint32(22, dataBytes.length, true);
      lfhView.setUint16(26, nomBytes.length, true);
      lfhView.setUint16(28, 0, true);
      lfh.set(nomBytes, 30);

      // Central Directory Entry
      const cde = new Uint8Array(46 + nomBytes.length);
      const cdeView = new DataView(cde.buffer);
      cdeView.setUint32(0,  0x02014b50, true);
      cdeView.setUint16(4,  20, true);
      cdeView.setUint16(6,  20, true);
      cdeView.setUint16(8,  0, true);
      cdeView.setUint16(10, 0, true);
      cdeView.setUint16(12, dosDate.time, true);
      cdeView.setUint16(14, dosDate.date, true);
      cdeView.setUint32(16, crc, true);
      cdeView.setUint32(20, dataBytes.length, true);
      cdeView.setUint32(24, dataBytes.length, true);
      cdeView.setUint16(28, nomBytes.length, true);
      cdeView.setUint16(30, 0, true);
      cdeView.setUint16(32, 0, true);
      cdeView.setUint16(34, 0, true);
      cdeView.setUint16(36, 0, true);
      cdeView.setUint32(38, 0, true);
      cdeView.setUint32(42, offset, true);
      cde.set(nomBytes, 46);

      localParts.push(lfh, dataBytes);
      centralDir.push(cde);
      offset += lfh.length + dataBytes.length;
    });

    // End of Central Directory
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    const cdSize = centralDir.reduce((s, c) => s + c.length, 0);
    eocdView.setUint32(0,  0x06054b50, true);
    eocdView.setUint16(4,  0, true);
    eocdView.setUint16(6,  0, true);
    eocdView.setUint16(8,  fichiers.length, true);
    eocdView.setUint16(10, fichiers.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, offset, true);
    eocdView.setUint16(20, 0, true);

    const allParts = [...localParts, ...centralDir, eocd];
    const total = allParts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    allParts.forEach(p => { result.set(p, pos); pos += p.length; });
    return result;
  },

  _crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = (crc ^ data[i]) >>> 0;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  },

  _dosDate(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time & 0xffff, date: date & 0xffff };
  }

};

window.TilexExport = TilexExport;
