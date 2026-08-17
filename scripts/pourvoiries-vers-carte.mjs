#!/usr/bin/env node
/**
 * Compacte le répertoire des pourvoiries FPQ pour TILEXMAP.
 *
 * POURQUOI
 * --------
 * Le jeu de données brut fait ~336 Ko de JSON. C'est une carte qu'on ouvre en
 * région, souvent sur une barre de réseau : chaque kilo-octet compte. Ce
 * script réécrit la même information en gardant tout, mais sans le gaspillage.
 *
 * Trois économies, sans aucune perte :
 *   1. Clés courtes (nom → n, latitude → la…). Le format est documenté dans le
 *      fichier lui-même, sous "cles".
 *   2. Les espèces sont mises en table : 24 espèces de chasse et 37 de pêche se
 *      répètent sur 310 fiches. Chaque pourvoirie ne garde que des index.
 *   3. Les champs vides disparaissent au lieu de porter un null.
 *
 * VÉRIFICATIONS refusant de produire un fichier douteux :
 *   - coordonnées présentes et à l'intérieur du Québec (une pourvoirie dans
 *     l'Atlantique enverrait quelqu'un nulle part)
 *   - numéros de permis uniques (c'est la clé naturelle du répertoire)
 *
 * USAGE
 *   node scripts/pourvoiries-vers-carte.mjs <pourvoiries.json> [sortie.json]
 *   npm run pourvoiries -- data/pourvoiries.json assets/pourvoiries-quebec.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const entree = args[0];
const sortie = args[1] || "assets/pourvoiries-quebec.json";

if (!entree || !existsSync(entree)) {
  console.error("Usage : node scripts/pourvoiries-vers-carte.mjs <pourvoiries.json> [sortie.json]");
  process.exit(1);
}

const brut = JSON.parse(readFileSync(entree, "utf8"));
const fiches = Array.isArray(brut) ? brut : brut.pourvoiries || brut.data;
if (!Array.isArray(fiches) || !fiches.length) {
  console.error("❌ Le fichier ne contient pas un tableau de pourvoiries.");
  process.exit(1);
}

/* ── Contrôles avant conversion ─────────────────────────────────────────── */
// Bounding box généreuse du Québec. But : attraper une coordonnée aberrante
// (inversion lat/lon, zéro, projection oubliée), pas juger de la précision.
const QC = { latMin: 44.5, latMax: 63.5, lonMin: -80.5, lonMax: -56.5 };

const problemes = [];
const permisVus = new Map();

fiches.forEach((f, i) => {
  const ref = f.nom || f.numero_permis || `fiche ${i}`;
  const la = Number(f.latitude), lo = Number(f.longitude);

  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    problemes.push(`${ref} : coordonnées manquantes ou illisibles`);
  } else if (la < QC.latMin || la > QC.latMax || lo < QC.lonMin || lo > QC.lonMax) {
    problemes.push(`${ref} : coordonnées hors du Québec (${la}, ${lo})`);
  }

  if (f.numero_permis) {
    if (permisVus.has(f.numero_permis)) {
      problemes.push(`permis ${f.numero_permis} en double : « ${permisVus.get(f.numero_permis)} » et « ${ref} »`);
    }
    permisVus.set(f.numero_permis, ref);
  }
});

if (problemes.length) {
  console.error(`❌ ${problemes.length} problème(s) — rien n'a été écrit :\n`);
  problemes.slice(0, 20).forEach((p) => console.error("   · " + p));
  if (problemes.length > 20) console.error(`   … et ${problemes.length - 20} autres`);
  console.error("\nCorrige la source avant de générer le fichier de carte.");
  process.exit(1);
}

/* ── Table des espèces ──────────────────────────────────────────────────── */
// Casse et accents varient dans la source (« Orignal » / « orignal »). On
// normalise pour dédoublonner, mais on garde la plus jolie graphie observée.
function cleEspece(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function construireTable(champ) {
  const vues = new Map();
  for (const f of fiches) {
    for (const e of f[champ] || []) {
      const k = cleEspece(e);
      if (!k) continue;
      const propre = String(e).trim();
      // On préfère la version capitalisée quand elle existe.
      if (!vues.has(k) || (/^[A-ZÉÈÀÎÔÛ]/.test(propre) && !/^[A-ZÉÈÀÎÔÛ]/.test(vues.get(k)))) {
        vues.set(k, propre);
      }
    }
  }
  const liste = [...vues.values()].sort((a, b) => a.localeCompare(b, "fr"));
  const index = new Map(liste.map((v, i) => [cleEspece(v), i]));
  return { liste, index };
}

const chasse = construireTable("especes_chasse");
const peche = construireTable("especes_peche");

function indexer(valeurs, table) {
  const out = [];
  for (const e of valeurs || []) {
    const i = table.index.get(cleEspece(e));
    if (i != null && !out.includes(i)) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/* ── Conversion ─────────────────────────────────────────────────────────── */
const txt = (v) => {
  const s = v == null ? "" : String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
};

const compactes = fiches.map((f) => {
  const o = {};
  const ajouter = (k, v) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) o[k] = v; };

  ajouter("p", txt(f.numero_permis));
  ajouter("n", txt(f.nom));
  ajouter("r", txt(f.region_touristique) || txt(f.region_fpq));
  ajouter("v", txt(f.ville));
  ajouter("ad", txt(f.adresse));
  ajouter("t", txt(f.telephone));
  ajouter("sf", txt(f.sans_frais));
  ajouter("w", txt(f.site_web));
  ajouter("u", txt(f.url_fiche));
  // 5 décimales ≈ 1 m : bien au-delà de ce qu'une carte routière exige.
  o.la = Math.round(Number(f.latitude) * 1e5) / 1e5;
  o.lo = Math.round(Number(f.longitude) * 1e5) / 1e5;
  // Les booléens ne sont écrits que lorsqu'ils sont vrais : un champ absent
  // se lit « non » côté carte, ce qui évite 310 × 5 « false » inutiles.
  if (f.droits_exclusifs === true) o.dx = 1;
  if (f.chasse === true) o.c = 1;
  if (f.peche === true) o.pe = 1;
  if (f.villegiature === true) o.vi = 1;
  if (f.plein_air === true) o.pa = 1;
  ajouter("ec", indexer(f.especes_chasse, chasse));
  ajouter("ep", indexer(f.especes_peche, peche));
  ajouter("he", txt(f.hebergement));
  if (Number.isFinite(Number(f.capacite)) && Number(f.capacite) > 0) o.ca = Number(f.capacite);
  ajouter("cl", txt(f.classification));
  ajouter("d", txt(f.description));
  return o;
});

const paquet = {
  source: "Fédération des pourvoiries du Québec (FPQ) — répertoire pourvoiries.com",
  extrait_le: "2026-08-17",
  n: compactes.length,
  // Le format est auto-documenté : pas besoin d'aller lire ce script pour
  // comprendre le fichier dans six mois.
  cles: {
    p: "numéro de permis", n: "nom", r: "région touristique", v: "ville",
    ad: "adresse", t: "téléphone", sf: "sans frais", w: "site web",
    u: "fiche FPQ", la: "latitude", lo: "longitude",
    dx: "droits exclusifs (PADE)", c: "chasse", pe: "pêche",
    vi: "villégiature", pa: "plein air",
    ec: "espèces de chasse (index)", ep: "espèces de pêche (index)",
    he: "hébergement", ca: "capacité", cl: "classification", d: "description",
  },
  especes_chasse: chasse.liste,
  especes_peche: peche.liste,
  // Ce que la carte doit dire à l'utilisateur, écrit ici pour que la limite
  // voyage avec la donnée au lieu de se perdre dans un commit.
  limites: [
    "Membres de la FPQ seulement — des pourvoiries non membres existent et ne figurent dans aucun répertoire centralisé.",
    "La capacité est indicative : la source liste les chalets un par un sans toujours donner de total.",
    "Prix et disponibilités ne sont pas dans ce jeu de données et changent à chaque saison.",
    "Un champ absent veut dire « absent de la source » — rien n'a été deviné.",
  ],
  pourvoiries: compactes,
};

writeFileSync(sortie, JSON.stringify(paquet));

/* ── Rapport ────────────────────────────────────────────────────────────── */
const ko = (n) => (n / 1024).toFixed(0) + " Ko";
const avant = readFileSync(entree).length;
const apres = readFileSync(sortie).length;
const compte = (k) => compactes.filter((o) => o[k]).length;

console.log(`\n✅ ${compactes.length} pourvoiries écrites dans ${sortie}\n`);
console.log(`   Poids       : ${ko(avant)} → ${ko(apres)}  (−${Math.round((1 - apres / avant) * 100)} %)`);
console.log(`   Espèces     : ${chasse.liste.length} de chasse · ${peche.liste.length} de pêche (mises en table)`);
console.log(`   Chasse      : ${compte("c")}`);
console.log(`   Pêche       : ${compte("pe")}`);
console.log(`   Villégiature: ${compte("vi")}`);
console.log(`   Plein air   : ${compte("pa")}`);
console.log(`   Droits excl.: ${compte("dx")}`);
console.log(`   Téléphone   : ${compte("t")} · Site web : ${compte("w")} · Description : ${compte("d")}`);

const regions = {};
compactes.forEach((o) => { if (o.r) regions[o.r] = (regions[o.r] || 0) + 1; });
console.log(`\n   Régions (${Object.keys(regions).length}) :`);
Object.entries(regions).sort((a, b) => b[1] - a[1]).forEach(([r, n]) => {
  console.log(`     ${String(n).padStart(4)}  ${r}`);
});
console.log(`\n📍 TILEXMAP charge ce fichier automatiquement au démarrage de la couche Pourvoiries.`);
