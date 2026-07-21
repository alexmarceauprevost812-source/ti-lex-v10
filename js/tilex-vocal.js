const TilexVocal = {
  mediaRecorder: null, chunks: [], enEcoute: false,

  proxyUrl() {
    const base = window.SB_URL;
    return base + "/functions/v1/vocal-proxy";
  },

  // Choisit un format d'enregistrement SUPPORTE par l'appareil.
  // Beaucoup de telephones (Samsung, iPhone) ne supportent PAS audio/webm :
  // sans ca, new MediaRecorder(...) plantait et le micro s'eteignait aussitot.
  _choisirMime() {
    const candidats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      for (const m of candidats) { if (MediaRecorder.isTypeSupported(m)) return m; }
    }
    return ''; // laisse le navigateur choisir son defaut
  },

  // Retourne true si le micro a VRAIMENT demarre, false sinon.
  // (Le bouton ne doit s'allumer qu'apres un vrai succes — sinon il « flashe ».)
  async demarrerEcoute() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = this._choisirMime();
      try {
        this.mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        this.mediaRecorder = new MediaRecorder(stream); // repli defaut navigateur
      }
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
      this.mediaRecorder.onstop = async () => {
        // libère le micro (coupe la pastille d'enregistrement de l'OS)
        try { if (this._stream) this._stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        const type = (this.mediaRecorder && this.mediaRecorder.mimeType) || mime || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        if (!blob.size) return;
        try {
          const texte = await this.transcrire(blob, type);
          if (texte && window.onTilexVocalInput) window.onTilexVocalInput(texte);
          else if (!texte && window.TilexToast) TilexToast.info("Rien entendu — réessaie.");
        } catch (e) {
          if (window.TilexToast) TilexToast.error("Transcription indisponible");
          else if (window.showToastMsg) showToastMsg("⚠️ Transcription indisponible");
        }
      };
      this._stream = stream;
      this.mediaRecorder.start(); this.enEcoute = true;
      if (window.TilexToast) TilexToast.info("\u{1F399}️ Ti-lex t'écoute...");
      return true;
    } catch (err) {
      this.enEcoute = false;
      console.warn('[TilexVocal] micro non démarré:', err && err.name, err && err.message);
      const refus = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      const msg = refus
        ? "🎙️ Micro bloqué — autorise-le pour ce site dans les réglages du navigateur."
        : "🎙️ Micro indisponible sur cet appareil — réessaie.";
      if (window.TilexToast && TilexToast.error) TilexToast.error(msg);
      else if (window.showToastMsg) showToastMsg(msg);
      if (window.onTilexVocalError) window.onTilexVocalError(err);
      return false;
    }
  },

  arreterEcoute() {
    if (this.mediaRecorder && this.enEcoute) { try { this.mediaRecorder.stop(); } catch (e) {} this.enEcoute = false; }
  },

  async transcrire(blob, type) {
    const r = await fetch(this.proxyUrl() + "?action=stt", {
      method: "POST",
      headers: { "Content-Type": type || blob.type || "audio/webm" },
      body: blob,
    });
    if (!r.ok) throw new Error("STT " + r.status);
    const d = await r.json();
    return (d && d.transcript) || "";
  },

  async parler(texte) {
    const r = await fetch(this.proxyUrl() + "?action=tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texte }),
    });
    const blob = await r.blob();
    new Audio(URL.createObjectURL(blob)).play();
  }
};
window.TilexVocal = TilexVocal;
