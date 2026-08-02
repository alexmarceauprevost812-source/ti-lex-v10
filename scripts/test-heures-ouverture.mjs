#!/usr/bin/env node
/**
 * Teste le lecteur d'heures d'ouverture de la carte (ouvertMaintenant).
 *
 * La fonction est extraite directement de carte.html : le test porte donc sur
 * le code reellement servi, pas sur une copie qui pourrait deriver.
 *
 * Regle de conception verifiee ici : quand la syntaxe OSM sort de ce que la
 * fonction sait lire, elle renvoie `null` plutot que de deviner. Mieux vaut
 * ne rien afficher que d'annoncer « ouvert » a quelqu'un devant une porte
 * barree.
 *
 * Usage : node scripts/test-heures-ouverture.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(racine, "carte.html"), "utf8");

const debut = html.indexOf("const JOURS_OSM=");
const fin = html.indexOf("/* ─── Fiche complete");
if (debut < 0 || fin < 0 || fin <= debut) {
  console.error("❌ Fonction ouvertMaintenant introuvable dans carte.html");
  process.exit(1);
}
const source = html.slice(debut, fin);
const ouvertMaintenant = new Function(`${source}; return ouvertMaintenant;`)();

// Le mercredi 2 avril 2025 est un mercredi, le 5 un samedi, le 6 un dimanche.
const CAS = [
  { oh: "24/7", quand: "2025-04-02T03:00:00", attendu: true, note: "ouvert en tout temps" },
  { oh: "Mo-Fr 09:00-17:00", quand: "2025-04-02T14:30:00", attendu: true, note: "en semaine, dans les heures" },
  { oh: "Mo-Fr 09:00-17:00", quand: "2025-04-02T18:30:00", attendu: false, note: "en semaine, apres la fermeture" },
  { oh: "Mo-Fr 09:00-17:00", quand: "2025-04-05T12:00:00", attendu: false, note: "samedi non couvert" },
  { oh: "Mo-Fr 09:00-17:00; Sa 10:00-16:00", quand: "2025-04-05T12:00:00", attendu: true, note: "bloc samedi" },
  { oh: "Mo-Su 06:00-23:00", quand: "2025-04-02T22:00:00", attendu: true, note: "tous les jours" },
  { oh: "Mo-Su 22:00-02:00", quand: "2025-04-02T23:30:00", attendu: true, note: "plage qui passe minuit" },
  { oh: "Su off; Mo-Sa 08:00-20:00", quand: "2025-04-06T10:00:00", attendu: false, note: "dimanche ferme" },
  { oh: "Mo-Fr 08:00-12:00,13:00-17:00", quand: "2025-04-02T12:30:00", attendu: false, note: "pause du midi" },
  { oh: "Mo-Fr 08:00-12:00,13:00-17:00", quand: "2025-04-02T14:00:00", attendu: true, note: "apres la pause" },
  { oh: "Mo-Fr sunrise-sunset", quand: "2025-04-02T14:00:00", attendu: null, note: "syntaxe non lisible → aucune affirmation" },
  { oh: "Mo-Fr 09:00-17:00 || PH off", quand: "2025-04-02T14:00:00", attendu: null, note: "regle avec jours feries → aucune affirmation" },
  { oh: "", quand: "2025-04-02T14:00:00", attendu: null, note: "champ vide" },
];

const VraiDate = Date;
function figerHorloge(iso) {
  globalThis.Date = class extends VraiDate {
    constructor(...a) {
      return a.length ? new VraiDate(...a) : new VraiDate(iso);
    }
    static now() { return VraiDate.parse(iso); }
  };
}

let reussis = 0;
const echecs = [];

for (const cas of CAS) {
  figerHorloge(cas.quand);
  let obtenu;
  try {
    const r = ouvertMaintenant(cas.oh);
    obtenu = r === null ? null : r.ouvert;
  } finally {
    globalThis.Date = VraiDate;
  }
  if (obtenu === cas.attendu) {
    reussis++;
  } else {
    echecs.push(`${JSON.stringify(cas.oh)} (${cas.note}) → ${obtenu}, attendu ${cas.attendu}`);
  }
}

if (echecs.length > 0) {
  console.error("❌ Lecteur d'heures d'ouverture — échecs :\n");
  for (const e of echecs) console.error("  · " + e);
  process.exit(1);
}

console.log(`✅ Heures d'ouverture — ${reussis} cas vérifiés (plage de nuit, pause du midi, jour fermé, syntaxe non lisible).`);
