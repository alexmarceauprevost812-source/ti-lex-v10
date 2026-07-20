// ============================================================
// ti-lex-AL v10 — Moteur Paye & Banque d'heures
// Auteur: Alex Marceau-Prévost
// Calcule: heures, paye (40$/h, 60$/h après 40h/semaine),
//          banque d'heures, cumul mensuel + cumul saison
// ============================================================

const TilexPaye = {

  // --- CONFIG ---
  TAUX: 40,          // taux normal $/h
  TAUX_SUP: 60,      // temps et demi $/h (après 40h/semaine)
  SEUIL_SEMAINE: 40, // heures avant temps supplémentaire

  // ============================================================
  // 1. CALCUL D'UNE JOURNÉE (heures travaillées)
  // ============================================================
  calculerJour(debut, fin, pauseMin = 30) {
    if (!debut || !fin) return 0;
    let [dh, dm] = debut.split(':').map(Number);
    let [fh, fm] = fin.split(':').map(Number);
    let mins = (fh * 60 + fm) - (dh * 60 + dm);
    if (mins < 0) mins += 24 * 60;   // shift qui passe minuit
    mins -= pauseMin;
    return Math.max(0, mins / 60);
  },

  // ============================================================
  // 2. NUMÉRO DE SEMAINE (pour grouper le cumul 40h)
  //    Semaine commence le dimanche (style québécois)
  // ============================================================
  numeroSemaine(dateISO) {
    const d = new Date(dateISO + 'T00:00:00');
    const debutAnnee = new Date(d.getFullYear(), 0, 1);
    const jours = Math.floor((d - debutAnnee) / 86400000);
    return d.getFullYear() + '-S' + Math.ceil((jours + debutAnnee.getDay() + 1) / 7);
  },

  // ============================================================
  // 3. CALCUL D'UNE SEMAINE COMPLÈTE
  //    Reçoit un tableau d'heures, applique 40$/h puis 60$/h
  //    Retourne paye + heures en banque (les heures sup)
  // ============================================================
  calculerSemaine(heuresParJour = []) {
    const total = heuresParJour.reduce((a, b) => a + b, 0);
    const heuresNormales = Math.min(total, this.SEUIL_SEMAINE);
    const heuresSup = Math.max(0, total - this.SEUIL_SEMAINE);

    const payeNormale = heuresNormales * this.TAUX;
    const payeSup = heuresSup * this.TAUX_SUP;

    return {
      totalHeures: total,
      heuresNormales: heuresNormales,
      heuresSup: heuresSup,       // ← ces heures vont "en banque"
      paye: payeNormale + payeSup,
      banque: heuresSup           // banque d'heures = heures sup accumulées
    };
  },

  // ============================================================
  // 4. CUMUL D'UN MOIS
  //    Reçoit un objet {dateISO: heures}, regroupe par semaine,
  //    additionne tout le mois
  // ============================================================
  calculerMois(joursDuMois = {}) {
    // Regrouper les heures par semaine
    const semaines = {};
    for (const [date, h] of Object.entries(joursDuMois)) {
      const sem = this.numeroSemaine(date);
      if (!semaines[sem]) semaines[sem] = [];
      semaines[sem].push(h);
    }

    let totalHeures = 0, totalPaye = 0, totalBanque = 0;
    for (const heures of Object.values(semaines)) {
      const r = this.calculerSemaine(heures);
      totalHeures += r.totalHeures;
      totalPaye += r.paye;
      totalBanque += r.banque;
    }

    return {
      totalHeures: Math.round(totalHeures * 100) / 100,
      paye: Math.round(totalPaye),
      banque: Math.round(totalBanque * 100) / 100,
      nbSemaines: Object.keys(semaines).length
    };
  },

  // ============================================================
  // 5. CUMUL SAISON COMPLÈTE
  //    Reçoit TOUTES les journées de la saison
  //    → ton GROS TOTAL avant le chômage 🎯
  // ============================================================
  calculerSaison(toutesLesJournees = {}) {
    // toutesLesJournees = {dateISO: heures, ...}
    const parMois = {};

    for (const [date, h] of Object.entries(toutesLesJournees)) {
      const mois = date.slice(0, 7); // "2026-01"
      if (!parMois[mois]) parMois[mois] = {};
      parMois[mois][date] = h;
    }

    const detailMois = {};
    let saisonHeures = 0, saisonPaye = 0, saisonBanque = 0;

    for (const [mois, jours] of Object.entries(parMois)) {
      const r = this.calculerMois(jours);
      detailMois[mois] = r;
      saisonHeures += r.totalHeures;
      saisonPaye += r.paye;
      saisonBanque += r.banque;
    }

    return {
      totalHeures: Math.round(saisonHeures * 100) / 100,
      payeTotale: Math.round(saisonPaye),
      banqueTotale: Math.round(saisonBanque * 100) / 100,
      detailParMois: detailMois,
      // 🎯 Estimation chômage: ~55% de la paye moyenne hebdo
      estimationChomage: Math.round((saisonPaye / 52) * 0.55)
    };
  },

  // ============================================================
  // 6. FORMAT JOLI (pour l'affichage)
  // ============================================================
  format(montant) {
    return (Number(montant) || 0).toLocaleString('fr-CA') + ' $';
  },

  formatHeures(h) {
    const heures = Math.floor(h);
    const mins = Math.round((h - heures) * 60);
    return heures + 'h' + (mins > 0 ? String(mins).padStart(2, '0') : '');
  }
};

// Export global
if (typeof window !== 'undefined') window.TilexPaye = TilexPaye;
if (typeof module !== 'undefined') module.exports = TilexPaye;
