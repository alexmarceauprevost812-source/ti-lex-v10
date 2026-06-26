/* ============================================================
   MIDAS — CERVEAU (le « pouvoir magique » de l'agent finance)
   ti-lex-AL v10 · Produit du Québec ⚜️
   ------------------------------------------------------------
   Librairie d'indicateurs techniques + scoring de confluence.
   100% Vanilla JS — aucun import/export. Tout est accroché à
   window.MidasIndicateurs et window.MidasScoring.

   ⚠️ PHILOSOPHIE (à respecter partout dans MIDAS) :
   Les indicateurs décrivent des PROBABILITÉS et des CONDITIONS
   de marché, PAS des certitudes. Aucun système ne prédit le
   sommet ou le creux parfait. Les sorties sont des SIGNAUX
   d'information, jamais des garanties de rendement.
   ============================================================ */

(function () {
  "use strict";

  // ============================================================
  // 1) INDICATEURS TECHNIQUES — calculs purs sur données OHLCV
  // ============================================================
  const Ind = {};

  /* --- Moyenne mobile simple (SMA) --- */
  Ind.sma = function (valeurs, periode) {
    try {
      if (!Array.isArray(valeurs) || valeurs.length < periode) return null;
      let somme = 0;
      for (let i = valeurs.length - periode; i < valeurs.length; i++) {
        somme += valeurs[i];
      }
      return somme / periode;
    } catch (e) {
      console.error("[MIDAS] sma:", e);
      return null;
    }
  };

  /* --- Série EMA complète (nulls en tête pour aligner les index) --- */
  Ind.emaSerie = function (valeurs, periode) {
    try {
      const out = new Array(valeurs.length).fill(null);
      if (!Array.isArray(valeurs) || valeurs.length < periode) return out;
      const k = 2 / (periode + 1);
      // Amorçage : SMA des `periode` premières valeurs
      let prec = 0;
      for (let i = 0; i < periode; i++) prec += valeurs[i];
      prec /= periode;
      out[periode - 1] = prec;
      for (let i = periode; i < valeurs.length; i++) {
        prec = valeurs[i] * k + prec * (1 - k);
        out[i] = prec;
      }
      return out;
    } catch (e) {
      console.error("[MIDAS] emaSerie:", e);
      return new Array((valeurs || []).length).fill(null);
    }
  };

  /* --- EMA (dernière valeur seulement) --- */
  Ind.ema = function (valeurs, periode) {
    const s = Ind.emaSerie(valeurs, periode);
    return s.length ? s[s.length - 1] : null;
  };

  /* --- RSI (lissage de Wilder), période 14 par défaut --- */
  Ind.rsi = function (closes, periode) {
    try {
      periode = periode || 14;
      if (!Array.isArray(closes) || closes.length < periode + 1) return null;
      let gains = 0;
      let pertes = 0;
      for (let i = 1; i <= periode; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) gains += d;
        else pertes -= d;
      }
      let moyGain = gains / periode;
      let moyPerte = pertes / periode;
      for (let i = periode + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        const g = d > 0 ? d : 0;
        const p = d < 0 ? -d : 0;
        moyGain = (moyGain * (periode - 1) + g) / periode;
        moyPerte = (moyPerte * (periode - 1) + p) / periode;
      }
      if (moyPerte === 0) return 100;
      const rs = moyGain / moyPerte;
      return 100 - 100 / (1 + rs);
    } catch (e) {
      console.error("[MIDAS] rsi:", e);
      return null;
    }
  };

  /* --- MACD 12/26/9 : retourne ligne, signal, histogramme + valeurs précédentes
         (pour détecter les croisements frais) --- */
  Ind.macd = function (closes, rapide, lent, signalP) {
    try {
      rapide = rapide || 12;
      lent = lent || 26;
      signalP = signalP || 9;
      if (!Array.isArray(closes) || closes.length < lent + signalP) return null;

      const ef = Ind.emaSerie(closes, rapide);
      const el = Ind.emaSerie(closes, lent);
      const ligneMacd = closes.map(function (_, i) {
        return ef[i] != null && el[i] != null ? ef[i] - el[i] : null;
      });

      // Signal = EMA de la portion définie de la ligne MACD
      const premierIdx = ligneMacd.findIndex(function (v) { return v != null; });
      const definie = ligneMacd.filter(function (v) { return v != null; });
      if (definie.length < signalP) return null;
      const sigDef = Ind.emaSerie(definie, signalP);

      const ligneSignal = new Array(closes.length).fill(null);
      for (let i = 0; i < sigDef.length; i++) {
        if (sigDef[i] != null) ligneSignal[premierIdx + i] = sigDef[i];
      }

      const i = closes.length - 1;
      const m = ligneMacd[i];
      const s = ligneSignal[i];
      const mPrec = ligneMacd[i - 1];
      const sPrec = ligneSignal[i - 1];

      let croisement = 0; // 1 = haussier frais, -1 = baissier frais, 0 = aucun
      if (m != null && s != null && mPrec != null && sPrec != null) {
        if (mPrec <= sPrec && m > s) croisement = 1;
        else if (mPrec >= sPrec && m < s) croisement = -1;
      }

      return {
        macd: m,
        signal: s,
        histogramme: m != null && s != null ? m - s : null,
        croisement: croisement
      };
    } catch (e) {
      console.error("[MIDAS] macd:", e);
      return null;
    }
  };

  /* --- Bandes de Bollinger (20, 2) + %B + largeur (détection de squeeze) --- */
  Ind.bollinger = function (closes, periode, mult) {
    try {
      periode = periode || 20;
      mult = mult || 2;
      if (!Array.isArray(closes) || closes.length < periode) return null;
      const tranche = closes.slice(-periode);
      const moyenne = tranche.reduce(function (a, b) { return a + b; }, 0) / periode;
      let variance = 0;
      for (let i = 0; i < tranche.length; i++) {
        variance += Math.pow(tranche[i] - moyenne, 2);
      }
      variance /= periode;
      const ecartType = Math.sqrt(variance);
      const haute = moyenne + mult * ecartType;
      const basse = moyenne - mult * ecartType;
      const prix = closes[closes.length - 1];
      const pctB = haute === basse ? 0.5 : (prix - basse) / (haute - basse);
      return {
        moyenne: moyenne,
        haute: haute,
        basse: basse,
        pctB: pctB,
        largeur: moyenne === 0 ? 0 : (haute - basse) / moyenne
      };
    } catch (e) {
      console.error("[MIDAS] bollinger:", e);
      return null;
    }
  };

  /* --- ATR (Average True Range) période 14 — volatilité, pour stop-loss --- */
  Ind.atr = function (highs, lows, closes, periode) {
    try {
      periode = periode || 14;
      if (!highs || !lows || !closes || closes.length < periode + 1) return null;
      const tr = [];
      for (let i = 1; i < closes.length; i++) {
        tr.push(Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        ));
      }
      let atr = 0;
      for (let i = 0; i < periode; i++) atr += tr[i];
      atr /= periode;
      for (let i = periode; i < tr.length; i++) {
        atr = (atr * (periode - 1) + tr[i]) / periode;
      }
      return atr;
    } catch (e) {
      console.error("[MIDAS] atr:", e);
      return null;
    }
  };

  /* --- OBV (On-Balance Volume) + tendance (divergence prix/volume) --- */
  Ind.obv = function (closes, volumes) {
    try {
      if (!closes || !volumes || closes.length < 2) return null;
      let v = 0;
      const serie = [0];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i - 1]) v += volumes[i] || 0;
        else if (closes[i] < closes[i - 1]) v -= volumes[i] || 0;
        serie.push(v);
      }
      const n = serie.length;
      const recent = serie.slice(-5).reduce(function (a, b) { return a + b; }, 0) / Math.min(5, n);
      const plusVieux = serie.slice(Math.max(0, n - 15), Math.max(0, n - 5));
      const moyVieux = plusVieux.length
        ? plusVieux.reduce(function (a, b) { return a + b; }, 0) / plusVieux.length
        : recent;
      return {
        valeur: v,
        tendance: recent > moyVieux ? 1 : recent < moyVieux ? -1 : 0
      };
    } catch (e) {
      console.error("[MIDAS] obv:", e);
      return null;
    }
  };

  /* --- Oscillateur stochastique (14, 3) --- */
  Ind.stochastique = function (highs, lows, closes, periode, lissD) {
    try {
      periode = periode || 14;
      lissD = lissD || 3;
      if (!highs || !lows || !closes || closes.length < periode + lissD) return null;
      const kvals = [];
      for (let i = periode - 1; i < closes.length; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = i - periode + 1; j <= i; j++) {
          if (highs[j] > hh) hh = highs[j];
          if (lows[j] < ll) ll = lows[j];
        }
        kvals.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
      }
      const k = kvals[kvals.length - 1];
      const d = kvals.slice(-lissD).reduce(function (a, b) { return a + b; }, 0) / lissD;
      return { k: k, d: d };
    } catch (e) {
      console.error("[MIDAS] stochastique:", e);
      return null;
    }
  };

  /* --- Z-score des rendements (détection d'anomalie / chute rapide) ---
         Fenêtre glissante : s'adapte à la tendance récente.
         |z| > 3  ≈ mouvement extrême (règle des 3 sigmas, ~0.3% des cas). */
  Ind.zscoreRendements = function (closes, fenetre) {
    try {
      fenetre = fenetre || 30;
      if (!closes || closes.length < fenetre + 1) return null;
      const rend = [];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] === 0) { rend.push(0); continue; }
        rend.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
      const tranche = rend.slice(-fenetre);
      const moy = tranche.reduce(function (a, b) { return a + b; }, 0) / tranche.length;
      let varc = 0;
      for (let i = 0; i < tranche.length; i++) varc += Math.pow(tranche[i] - moy, 2);
      varc /= tranche.length;
      const sd = Math.sqrt(varc);
      const dernier = rend[rend.length - 1];
      return {
        z: sd === 0 ? 0 : (dernier - moy) / sd,
        dernierRendement: dernier
      };
    } catch (e) {
      console.error("[MIDAS] zscoreRendements:", e);
      return null;
    }
  };

  /* --- Calcule TOUS les indicateurs d'un coup à partir de chandelles OHLCV.
         `bougies` = [{o,h,l,c,v}, ...] OU on passe directement closes via options. */
  Ind.analyserComplet = function (bougies, options) {
    try {
      options = options || {};
      let closes, highs, lows, volumes;
      if (Array.isArray(bougies) && bougies.length && typeof bougies[0] === "object") {
        closes = bougies.map(function (b) { return b.c; });
        highs = bougies.map(function (b) { return b.h != null ? b.h : b.c; });
        lows = bougies.map(function (b) { return b.l != null ? b.l : b.c; });
        volumes = bougies.map(function (b) { return b.v != null ? b.v : 0; });
      } else {
        // bougies = tableau de prix de clôture seulement (ex. sparkline CoinGecko)
        closes = bougies || [];
        highs = closes;
        lows = closes;
        volumes = options.volumes || closes.map(function () { return 0; });
      }

      // Périodes adaptées à la longueur des données (court terme vs long terme)
      const longue = closes.length >= 220 ? 200 : Math.max(10, Math.floor(closes.length / 2));
      const courte = closes.length >= 220 ? 50 : Math.max(5, Math.floor(longue / 3));

      return {
        prix: closes.length ? closes[closes.length - 1] : null,
        rsi: Ind.rsi(closes, 14),
        macd: Ind.macd(closes),
        smaCourte: Ind.sma(closes, courte),
        smaLongue: Ind.sma(closes, longue),
        bollinger: Ind.bollinger(closes),
        atr: Ind.atr(highs, lows, closes),
        obv: Ind.obv(closes, volumes),
        stochastique: Ind.stochastique(highs, lows, closes),
        zscore: Ind.zscoreRendements(closes),
        periodes: { courte: courte, longue: longue }
      };
    } catch (e) {
      console.error("[MIDAS] analyserComplet:", e);
      return null;
    }
  };

  // ============================================================
  // 2) SCORING DE CONFLUENCE — combine les indicateurs en 1 verdict
  // ============================================================
  // Principe : chaque indicateur « vote » dans [-1, +1].
  // On pondère, on additionne, on normalise sur [-100, +100].
  // Un signal n'est fiable que si PLUSIEURS indicateurs s'accordent
  // (confluence) — ça réduit les faux signaux.
  const Score = {};

  // Pondérations (somme = 100) : tendance 40, momentum 30, volatilité 15, volume 15
  Score.POIDS = {
    macd: 22,        // tendance
    croisementMA: 18, // tendance (golden/death cross)
    rsi: 16,         // momentum
    stochastique: 14, // momentum
    bollinger: 15,   // volatilité / retour à la moyenne
    obv: 15          // volume / confirmation
  };

  Score.DISCLAIMER =
    "Information éducative — PAS un conseil financier personnalisé. " +
    "Les signaux ne sont pas des garanties de rendement. Faites vos propres " +
    "recherches et consultez un conseiller inscrit à l'AMF avant d'investir. " +
    "La gestion du risque (taille de position, stop-loss) reste votre responsabilité.";

  /* Évalue un objet d'indicateurs (sortie de analyserComplet) → verdict complet */
  Score.evaluer = function (ind) {
    try {
      if (!ind) return null;
      const votes = {};
      const raisons = [];

      // --- MACD (tendance) ---
      if (ind.macd && ind.macd.histogramme != null) {
        let v = ind.macd.histogramme > 0 ? 0.6 : -0.6;
        if (ind.macd.croisement === 1) { v = 1; raisons.push("Croisement MACD haussier frais"); }
        else if (ind.macd.croisement === -1) { v = -1; raisons.push("Croisement MACD baissier frais"); }
        else raisons.push(ind.macd.histogramme > 0 ? "MACD au-dessus du signal (haussier)" : "MACD sous le signal (baissier)");
        votes.macd = v;
      }

      // --- Croisement de moyennes mobiles (tendance) ---
      if (ind.smaCourte != null && ind.smaLongue != null) {
        const v = ind.smaCourte > ind.smaLongue ? 1 : -1;
        votes.croisementMA = v;
        raisons.push(v > 0
          ? "MM courte au-dessus de la longue (tendance haussière)"
          : "MM courte sous la longue (tendance baissière)");
      }

      // --- RSI (momentum / retour à la moyenne) ---
      if (ind.rsi != null) {
        let v = 0;
        if (ind.rsi < 30) { v = 1; raisons.push("RSI en survente (<30) — rebond possible"); }
        else if (ind.rsi < 45) v = 0.3;
        else if (ind.rsi <= 55) v = 0;
        else if (ind.rsi <= 70) v = -0.3;
        else { v = -1; raisons.push("RSI en surachat (>70) — essoufflement possible"); }
        votes.rsi = v;
      }

      // --- Stochastique (momentum) ---
      if (ind.stochastique && ind.stochastique.k != null) {
        let v = 0;
        const k = ind.stochastique.k;
        if (k < 20) { v = 1; raisons.push("Stochastique en survente (<20)"); }
        else if (k > 80) { v = -1; raisons.push("Stochastique en surachat (>80)"); }
        else v = (50 - k) / 50; // pente douce vers 0
        votes.stochastique = v;
      }

      // --- Bollinger %B (volatilité / retour à la moyenne) ---
      if (ind.bollinger && ind.bollinger.pctB != null) {
        const b = ind.bollinger.pctB;
        let v = 0;
        if (b < 0) { v = 1; raisons.push("Prix sous la bande inférieure de Bollinger"); }
        else if (b > 1) { v = -1; raisons.push("Prix au-dessus de la bande supérieure de Bollinger"); }
        else v = (0.5 - b) * 2; // -1..+1
        votes.bollinger = v;
      }

      // --- OBV (volume / confirmation) ---
      if (ind.obv && ind.obv.tendance != null) {
        votes.obv = ind.obv.tendance;
        if (ind.obv.tendance !== 0) {
          raisons.push(ind.obv.tendance > 0
            ? "Volume (OBV) confirme la hausse"
            : "Volume (OBV) confirme la baisse");
        }
      }

      // --- Calcul du score pondéré ---
      let score = 0;
      let poidsUtilise = 0;
      let nbHaussier = 0;
      let nbBaissier = 0;
      let nbVotes = 0;
      for (const cle in Score.POIDS) {
        if (votes[cle] == null) continue;
        score += votes[cle] * Score.POIDS[cle];
        poidsUtilise += Score.POIDS[cle];
        nbVotes++;
        if (votes[cle] > 0.15) nbHaussier++;
        else if (votes[cle] < -0.15) nbBaissier++;
      }
      // Normaliser sur 100 selon le poids réellement disponible
      let scoreNorm = poidsUtilise > 0 ? Math.round((score / poidsUtilise) * 100) : 0;
      if (Object.is(scoreNorm, -0)) scoreNorm = 0; // évite l'affichage « -0 »

      // --- Confluence : % d'indicateurs qui s'accordent avec le signe ---
      const dominant = scoreNorm >= 0 ? nbHaussier : nbBaissier;
      const confluence = nbVotes > 0 ? Math.round((dominant / nbVotes) * 100) : 0;

      // --- Verdict ---
      let verdict, etiquette, couleur;
      if (scoreNorm >= 50) {
        verdict = "ACCUMULATION"; etiquette = "Zone d'accumulation forte"; couleur = "#37e0a0";
      } else if (scoreNorm >= 20) {
        verdict = "HAUSSIER"; etiquette = "Signaux haussiers"; couleur = "#9ee6c4";
      } else if (scoreNorm > -20) {
        verdict = "NEUTRE"; etiquette = "Neutre / indécis"; couleur = "#ffcf4a";
      } else if (scoreNorm > -50) {
        verdict = "BAISSIER"; etiquette = "Signaux baissiers"; couleur = "#ff9e7d";
      } else {
        verdict = "DISTRIBUTION"; etiquette = "Zone de distribution forte"; couleur = "#ff4d4d";
      }

      // --- Gestion du risque : stop-loss suggéré basé sur l'ATR (2x ATR) ---
      let stopSuggere = null;
      if (ind.atr != null && ind.prix != null) {
        stopSuggere = scoreNorm >= 0
          ? +(ind.prix - 2 * ind.atr).toFixed(8)
          : +(ind.prix + 2 * ind.atr).toFixed(8);
      }

      return {
        score: scoreNorm,            // -100..+100
        verdict: verdict,            // ACCUMULATION/HAUSSIER/NEUTRE/BAISSIER/DISTRIBUTION
        etiquette: etiquette,
        couleur: couleur,
        confluence: confluence,      // 0..100 (% d'accord entre indicateurs)
        nbIndicateurs: nbVotes,
        raisons: raisons,
        stopLossSuggere: stopSuggere,
        atr: ind.atr,
        disclaimer: Score.DISCLAIMER
      };
    } catch (e) {
      console.error("[MIDAS] evaluer:", e);
      return null;
    }
  };

  // Expose
  window.MidasIndicateurs = Ind;
  window.MidasScoring = Score;
  console.log("[MIDAS] Cerveau chargé — indicateurs + scoring de confluence prêts.");
})();
