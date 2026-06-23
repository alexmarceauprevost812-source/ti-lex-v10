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
      this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        const texte = await this.transcrire(blob);
        if (texte && window.onTilexVocalInput) window.onTilexVocalInput(texte);
      };
      this.mediaRecorder.start(); this.enEcoute = true;
      if (window.TilexToast) TilexToast.info("\u{1F399}️ Ti-lex t'écoute...");
    } catch (err) { if (window.TilexToast) TilexToast.error("Micro refusé"); }
  },

  arreterEcoute() {
    if (this.mediaRecorder && this.enEcoute) { this.mediaRecorder.stop(); this.enEcoute = false; }
  },

  async transcrire(blob) {
    const r = await fetch(this.proxyUrl() + "?action=stt", {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: blob,
    });
    const d = await r.json();
    return d?.transcript || "";
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
