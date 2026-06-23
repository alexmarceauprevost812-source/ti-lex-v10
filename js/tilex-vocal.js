const TilexVocal = {
  mediaRecorder: null, chunks: [], enEcoute: false,
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
      if (window.TilexToast) TilexToast.info("🎙️ Ti-lex t'écoute...");
    } catch (err) { if (window.TilexToast) TilexToast.error("Micro refusé"); }
  },
  arreterEcoute() { if (this.mediaRecorder && this.enEcoute) { this.mediaRecorder.stop(); this.enEcoute = false; } },
  async transcrire(blob) {
    const r = await fetch("https://api.deepgram.com/v1/listen?language=fr-CA&model=nova-2&smart_format=true", {
      method: "POST", headers: { "Authorization": `Token ${window.DEEPGRAM_KEY}`, "Content-Type": "audio/webm" }, body: blob });
    const d = await r.json();
    return d?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  },
  async parler(texte) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${window.ELEVENLABS_VOICE_ID}`, {
      method: "POST", headers: { "xi-api-key": window.ELEVENLABS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texte, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
    const blob = await r.blob();
    new Audio(URL.createObjectURL(blob)).play();
  }
};
window.TilexVocal = TilexVocal;
