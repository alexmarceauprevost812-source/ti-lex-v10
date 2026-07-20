const TilexVocal = {
  mediaRecorder: null, chunks: [], enEcoute: false,

  proxyUrl() {
    const base = window.SB_URL;
    return base + "/functions/v1/vocal-proxy";
  },

  async demarrerEcoute() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream); this.chunks = [];
      this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
      this.mediaRecorder.onstop = async () => {
        // libère le micro (coupe la pastille d'enregistrement de l'OS)
        try { if (this._stream) this._stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        if (!blob.size) return;
        try {
          const texte = await this.transcrire(blob);
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
    } catch (err) {
      this.enEcoute = false;
      if (window.TilexToast) TilexToast.error("Micro refusé");
      else if (window.showToastMsg) showToastMsg("⚠️ Accès micro refusé");
      if (window.onTilexVocalError) window.onTilexVocalError(err);
    }
  },

  arreterEcoute() {
    if (this.mediaRecorder && this.enEcoute) { try { this.mediaRecorder.stop(); } catch (e) {} this.enEcoute = false; }
  },

  async transcrire(blob) {
    const r = await fetch(this.proxyUrl() + "?action=stt", {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
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
