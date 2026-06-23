const TilexSafeFetch = {
  async appeler(url, options = {}, retries = 2, timeout = 10000) {
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
        if (tentative === retries) {
          if (window.TilexToast) TilexToast.error("Connexion échouée");
          throw err;
        }
        await new Promise(res => setTimeout(res, 1000 * (tentative + 1)));
      }
    }
  }
};
window.TilexSafeFetch = TilexSafeFetch;
