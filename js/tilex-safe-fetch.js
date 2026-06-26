const TilexSafeFetch = {
  async appeler(url, options = {}, retries = 2, timeout = 10000) {
    // 🔒 On ne rejoue QUE les méthodes idempotentes (ou opt-in explicite via retryUnsafe),
    // sinon un POST/PUT/DELETE rejoué peut dupliquer un enregistrement / un paiement.
    const method = (options.method || "GET").toUpperCase();
    const retryableMethod = ["GET", "HEAD", "OPTIONS"].includes(method) || options.retryUnsafe === true;
    for (let tentative = 0; tentative <= retries; tentative++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      } catch (err) {
        clearTimeout(timer);
        // Transitoire = timeout (AbortError), panne réseau (TypeError), 5xx, 408, 429.
        const transient = err.name === "AbortError" || err.name === "TypeError" ||
          /^HTTP (5\d\d|408|429)$/.test(err.message);
        if (!retryableMethod || !transient || tentative === retries) {
          if (window.TilexToast) TilexToast.error("Connexion échouée");
          throw err;
        }
        await new Promise(res => setTimeout(res, 1000 * (tentative + 1)));
      }
    }
  }
};
window.TilexSafeFetch = TilexSafeFetch;
