/* ============================================================
   js/tilex-coword-files.js — Pièces jointes pour Coword
   ti-lex-AL v10 — Alex Marceau-Prévost
   Permet d'ajouter des IMAGES, FICHIERS texte et ZIP à une job.
   - Images  → envoyées à Claude en vision (base64).
   - Texte   → contenu ajouté au contexte des agents.
   - ZIP     → décompressé côté navigateur (DecompressionStream),
               chaque fichier texte/image devient une pièce.
   API : TilexCowordFiles.brancherInput(input, apercuEl)
         TilexCowordFiles.obtenir()  ·  .vider()
   ============================================================ */

const TilexCowordFiles = (() => {

  let _pieces = [];              // [{nom,type:'texte'|'image',mime,contenu}]
  let _apercuEl = null;
  const MAX_TXT = 60000;         // ~60 Ko de texte par fichier
  const MAX_IMG = 1500000;       // ~1.5 Mo par image (base64)
  const MAX_PIECES = 12;

  const EXT_TXT = /\.(js|mjs|cjs|jsx|ts|tsx|html?|css|scss|json|md|txt|csv|xml|yml|yaml|py|rb|php|java|c|cpp|cs|go|rs|sh|sql|vue|svelte|env|toml|ini|conf)$/i;
  const EXT_IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

  function _mimeImg(nom) {
    const e = (nom.split('.').pop() || '').toLowerCase();
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' })[e] || 'image/png';
  }
  function _toast(m) { if (window.showToastMsg) window.showToastMsg(m); else if (window.showToast) window.showToast(m); }

  function _ajoutPiece(p) {
    if (_pieces.length >= MAX_PIECES) { _toast('Max ' + MAX_PIECES + ' pièces'); return; }
    _pieces.push(p);
    _rendreApercu();
  }

  /* --- Lecture d'un fichier File --- */
  function _lireFichier(file) {
    return new Promise((resolve) => {
      const nom = file.name || 'fichier';
      if (/\.zip$/i.test(nom) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
        file.arrayBuffer().then((buf) => _lireZip(nom, new Uint8Array(buf))).then(resolve).catch(() => resolve());
        return;
      }
      if (EXT_IMG.test(nom) || (file.type && file.type.startsWith('image/'))) {
        const fr = new FileReader();
        fr.onload = () => {
          const dataUrl = String(fr.result || '');
          const b64 = dataUrl.split(',')[1] || '';
          if (b64.length > MAX_IMG) { _toast('Image trop grosse : ' + nom); return resolve(); }
          _ajoutPiece({ nom, type: 'image', mime: file.type || _mimeImg(nom), contenu: b64 });
          resolve();
        };
        fr.onerror = () => resolve();
        fr.readAsDataURL(file);
        return;
      }
      // Texte (ou tout autre → tenté en texte)
      const fr = new FileReader();
      fr.onload = () => {
        let txt = String(fr.result || '');
        if (txt.length > MAX_TXT) txt = txt.slice(0, MAX_TXT) + '\n… (tronqué)';
        _ajoutPiece({ nom, type: 'texte', mime: file.type || 'text/plain', contenu: txt });
        resolve();
      };
      fr.onerror = () => resolve();
      fr.readAsText(file);
    });
  }

  /* --- Décompression ZIP native (store + deflate) --- */
  async function _inflate(bytes, methode) {
    if (methode === 0) return bytes;                        // store
    if (methode === 8 && 'DecompressionStream' in window) { // deflate-raw
      try {
        const ds = new DecompressionStream('deflate-raw');
        const blob = new Blob([bytes]);
        const stream = blob.stream().pipeThrough(ds);
        const out = await new Response(stream).arrayBuffer();
        return new Uint8Array(out);
      } catch (e) { return null; }
    }
    return null;
  }

  async function _lireZip(nomZip, data) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const dec = new TextDecoder();
    let i = 0, n = 0;
    while (i + 4 <= data.length && dv.getUint32(i, true) === 0x04034b50) {
      const methode = dv.getUint16(i + 8, true);
      const compSize = dv.getUint32(i + 18, true);
      const nameLen = dv.getUint16(i + 26, true);
      const extraLen = dv.getUint16(i + 28, true);
      const nameStart = i + 30;
      const nom = dec.decode(data.subarray(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      const comp = data.subarray(dataStart, dataStart + compSize);
      i = dataStart + compSize;

      if (!nom.endsWith('/') && n < MAX_PIECES) {
        const brut = await _inflate(comp, methode);
        if (brut) {
          if (EXT_IMG.test(nom)) {
            let bin = ''; for (let k = 0; k < brut.length; k++) bin += String.fromCharCode(brut[k]);
            const b64 = btoa(bin);
            if (b64.length <= MAX_IMG) { _ajoutPiece({ nom: nom.split('/').pop(), type: 'image', mime: _mimeImg(nom), contenu: b64 }); n++; }
          } else if (EXT_TXT.test(nom)) {
            let txt = dec.decode(brut);
            if (txt.length > MAX_TXT) txt = txt.slice(0, MAX_TXT) + '\n… (tronqué)';
            _ajoutPiece({ nom, type: 'texte', mime: 'text/plain', contenu: txt }); n++;
          }
        }
      }
      // Si un data descriptor est présent (compSize=0), on arrête pour rester robuste.
      if (compSize === 0) break;
    }
    _toast('📦 ' + nomZip + ' : ' + n + ' fichier(s) importé(s)');
  }

  /* --- Aperçu (chips) --- */
  function _rendreApercu() {
    if (!_apercuEl) return;
    if (!_pieces.length) { _apercuEl.innerHTML = ''; return; }
    _apercuEl.innerHTML = _pieces.map((p, i) => {
      const ico = p.type === 'image' ? '🖼️' : '📄';
      return `<span class="cwf-chip">${ico} ${_esc(p.nom)}<button onclick="TilexCowordFiles.retirer(${i})" title="Retirer">✕</button></span>`;
    }).join('');
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function retirer(i) { _pieces.splice(i, 1); _rendreApercu(); }
  function vider() { _pieces = []; _rendreApercu(); }
  function obtenir() { return _pieces.slice(); }

  /* --- Branche un <input type=file> + un conteneur d'aperçu --- */
  function brancherInput(input, apercuEl) {
    _apercuEl = apercuEl || _apercuEl;
    if (!input || input._cwfBranché) return;
    input._cwfBranché = true;
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) await _lireFichier(f);
      input.value = '';
    });
    _rendreApercu();
  }

  function _style() {
    if (document.getElementById('tilex-cwf-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-cwf-style';
    s.textContent = `
      .cwf-apercu{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px;}
      .cwf-chip{display:inline-flex;align-items:center;gap:6px;background:#101017;border:1px solid #30363d;
        border-radius:20px;padding:4px 10px;font-size:12px;color:#c9d1d9;}
      .cwf-chip button{background:none;border:none;color:#8b949e;cursor:pointer;font-size:13px;padding:0;line-height:1;}
      .cwf-chip button:hover{color:#f85149;}
      .cwf-btn{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:11px;padding:11px 13px;
        font-size:15px;cursor:pointer;white-space:nowrap;}
    `;
    document.head.appendChild(s);
  }
  _style();

  return { brancherInput, obtenir, vider, retirer };

})();

window.TilexCowordFiles = TilexCowordFiles;
