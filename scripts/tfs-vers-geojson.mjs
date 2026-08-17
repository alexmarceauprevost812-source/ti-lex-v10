#!/usr/bin/env node
/**
 * Convertit les Territoires fauniques structurés (TFS) du gouvernement du
 * Québec en un fichier compact que TILEXMAP peut charger hors réseau.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Le TFS officiel est un Shapefile de ~23 Mo : beaucoup trop lourd pour une
 * carte qu'on ouvre sur un cellulaire, à 2 h de route au nord, sur une barre
 * de réseau. Ce script simplifie les contours et ne garde que les champs
 * réellement affichés, pour tomber à quelques centaines de kilo-octets.
 *
 * SOURCE OFFICIELLE (licence CC BY 4.0 — réutilisation permise avec mention)
 *   https://www.donneesquebec.ca/recherche/dataset/territoires-fauniques-structures
 *
 * Le TFS couvre 6 types de territoires du domaine de l'État :
 *   AFC  Aire faunique communautaire
 *   PLA  Petit lac aménagé
 *   PADE Pourvoirie à droits exclusifs   ← les limites de pourvoirie
 *   RF   Refuge faunique
 *   RSF  Réserve faunique
 *   ZEC  Zone d'exploitation contrôlée
 *
 * MODE D'EMPLOI
 * -------------
 * 1. Télécharge le Shapefile depuis Données Québec (lien ci-dessus).
 *
 * 2. Convertis-le en GeoJSON WGS 84. Le TFS est en projection québécoise
 *    (NAD83 / Québec Lambert, EPSG:32198) — il FAUT reprojeter en EPSG:4326,
 *    sinon les polygones atterrissent dans l'océan Atlantique.
 *
 *      ogr2ogr -f GeoJSON -t_srs EPSG:4326 tfs.geojson TFS.shp
 *
 *    (ogr2ogr vient de GDAL : `brew install gdal` ou `apt install gdal-bin`)
 *
 * 3. Lance ce script :
 *
 *      node scripts/tfs-vers-geojson.mjs tfs.geojson assets/territoires-quebec.json
 *
 * 4. TILEXMAP détecte le fichier tout seul au prochain chargement de /carte
 *    et remplace les contours OpenStreetMap par les contours officiels.
 *
 * Options :
 *   --tolerance=0.0015   Simplification des contours en degrés (défaut 0.0015,
 *                        soit ~150 m). Monte pour un fichier plus léger,
 *                        descends pour des contours plus fidèles.
 *   --types=ZEC,RSF      Ne garder que certains types.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const positionnels = args.filter((a) => !a.startsWith("--"));
const options = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const entree = positionnels[0];
const sortie = positionnels[1] || "assets/territoires-quebec.json";
const TOLERANCE = parseFloat(options.tolerance ?? "0.0015");
const TYPES_VOULUS = options.types ? String(options.types).split(",").map((s) => s.trim().toUpperCase()) : null;

if (!entree) {
  console.error("Usage : node scripts/tfs-vers-geojson.mjs <tfs.geojson> [sortie.json]\n");
  console.error("Lis l'en-tête du fichier pour la marche à suivre complète.");
  process.exit(1);
}
if (!existsSync(entree)) {
  console.error(`❌ Fichier introuvable : ${entree}`);
  process.exit(1);
}

/* ── Reconnaissance du type de territoire ──────────────────────────────────
   Les noms de colonnes du TFS ont changé au fil des millésimes. Plutôt que
   de miser sur un seul nom, on cherche la valeur dans plusieurs champs
   candidats — et on retombe sur le nom du territoire s'il le faut. */
const TYPES = {
  AFC:  { nom: "Aire faunique communautaire", couleur: "#7bc043" },
  PLA:  { nom: "Petit lac aménagé",           couleur: "#4fc3f7" },
  PADE: { nom: "Pourvoirie à droits exclusifs", couleur: "#ff7f27" },
  RF:   { nom: "Refuge faunique",             couleur: "#c084fc" },
  RSF:  { nom: "Réserve faunique",            couleur: "#2a7cff" },
  ZEC:  { nom: "Zone d'exploitation contrôlée", couleur: "#3ea55a" },
};

const CHAMPS_TYPE = ["TYPE_TF", "TYPE", "CD_TYPE_TF", "TYPE_TERR", "CATEGORIE", "TYPE_TFS"];
const CHAMPS_NOM  = ["NOM_TF", "NOM", "NOM_TERR", "TOPONYME", "NOM_TERRIT", "NM_TERR"];
const CHAMPS_GEST = ["GESTIONNAI", "GESTIONNAIRE", "ORGANISME", "EXPLOITANT", "OPERATEUR"];
const CHAMPS_REG  = ["REGION", "REG_ADM", "NOM_REG", "REGION_ADM"];

function premierChamp(props, candidats) {
  for (const c of candidats) {
    for (const cle of Object.keys(props)) {
      if (cle.toUpperCase() === c && props[cle] != null && String(props[cle]).trim() !== "") {
        return String(props[cle]).trim();
      }
    }
  }
  return "";
}

function deduireType(props, nom) {
  const brut = premierChamp(props, CHAMPS_TYPE).toUpperCase();
  if (TYPES[brut]) return brut;
  // Certains millésimes écrivent le type au long plutôt qu'en sigle.
  const texte = (brut + " " + nom).toLowerCase();
  if (/\bzec\b|exploitation contr/.test(texte)) return "ZEC";
  if (/r[ée]serve faunique/.test(texte)) return "RSF";
  if (/pourvoirie/.test(texte)) return "PADE";
  if (/refuge/.test(texte)) return "RF";
  if (/aire faunique|communautaire/.test(texte)) return "AFC";
  if (/petit lac|lac am[ée]nag/.test(texte)) return "PLA";
  return "";
}

/* ── Simplification Douglas-Peucker ────────────────────────────────────────
   Un contour de ZEC peut compter des milliers de points. À l'échelle où on
   l'affiche, on n'en voit pas la différence — mais le poids du fichier, lui,
   se voit sur un lien cellulaire faible. */
function distancePerpendiculaire(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + tc * dx), y - (y1 + tc * dy));
}

function simplifier(points, tolerance) {
  if (points.length <= 3) return points;
  let indexMax = 0, distMax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distancePerpendiculaire(points[i], points[0], points[points.length - 1]);
    if (d > distMax) { indexMax = i; distMax = d; }
  }
  if (distMax > tolerance) {
    const gauche = simplifier(points.slice(0, indexMax + 1), tolerance);
    const droite = simplifier(points.slice(indexMax), tolerance);
    return gauche.slice(0, -1).concat(droite);
  }
  return [points[0], points[points.length - 1]];
}

// Un anneau simplifié doit rester un polygone fermé d'au moins 4 points.
function simplifierAnneau(anneau, tolerance) {
  const s = simplifier(anneau, tolerance);
  if (s.length < 4) return anneau.length >= 4 ? anneau : null;
  const [px, py] = s[0], [dx, dy] = s[s.length - 1];
  if (px !== dx || py !== dy) s.push([px, py]);
  return s;
}

function simplifierGeometrie(geom, tolerance) {
  if (!geom) return null;
  const arrondir = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

  if (geom.type === "Polygon") {
    const anneaux = geom.coordinates
      .map((a) => simplifierAnneau(a, tolerance))
      .filter(Boolean)
      .map((a) => a.map(arrondir));
    return anneaux.length ? { type: "Polygon", coordinates: anneaux } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates
      .map((poly) => poly.map((a) => simplifierAnneau(a, tolerance)).filter(Boolean).map((a) => a.map(arrondir)))
      .filter((poly) => poly.length > 0);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
}

function compterPoints(geom) {
  if (!geom) return 0;
  const anneaux = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  return anneaux.reduce((n, a) => n + a.length, 0);
}

/* ── Conversion ────────────────────────────────────────────────────────── */
console.log(`📂 Lecture de ${entree}…`);
let source;
try {
  source = JSON.parse(readFileSync(entree, "utf8"));
} catch (e) {
  console.error(`❌ Lecture impossible : ${e.message}`);
  console.error("   Le fichier doit être du GeoJSON. Convertis le Shapefile avec :");
  console.error("   ogr2ogr -f GeoJSON -t_srs EPSG:4326 tfs.geojson TFS.shp");
  process.exit(1);
}

const entites = source.features || (source.type === "Feature" ? [source] : []);
if (!entites.length) {
  console.error("❌ Aucune entité trouvée. Le fichier est-il bien du GeoJSON ?");
  process.exit(1);
}

// Garde-fou : le TFS est fourni en projection québécoise. Si on voit des
// coordonnées en mètres au lieu de degrés, c'est que la reprojection a sauté.
const premiereCoord = (() => {
  for (const f of entites) {
    const g = f.geometry;
    if (!g || !g.coordinates) continue;
    let c = g.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && typeof c[0] === "number") return c;
  }
  return null;
})();

if (premiereCoord && (Math.abs(premiereCoord[0]) > 180 || Math.abs(premiereCoord[1]) > 90)) {
  console.error(`❌ Les coordonnées ne sont pas en degrés (vu : ${premiereCoord}).`);
  console.error("   Le TFS est en NAD83 / Québec Lambert — il faut reprojeter en WGS 84 :");
  console.error("   ogr2ogr -f GeoJSON -t_srs EPSG:4326 tfs.geojson TFS.shp");
  process.exit(1);
}

const sortieEntites = [];
const parType = {};
const ignores = { sansGeometrie: 0, typeInconnu: 0, filtres: 0 };
let pointsAvant = 0, pointsApres = 0;

for (const f of entites) {
  const props = f.properties || {};
  const nom = premierChamp(props, CHAMPS_NOM);
  const type = deduireType(props, nom);

  if (!type) { ignores.typeInconnu++; continue; }
  if (TYPES_VOULUS && !TYPES_VOULUS.includes(type)) { ignores.filtres++; continue; }

  pointsAvant += compterPoints(f.geometry);
  const geom = simplifierGeometrie(f.geometry, TOLERANCE);
  if (!geom) { ignores.sansGeometrie++; continue; }
  pointsApres += compterPoints(geom);

  const gestionnaire = premierChamp(props, CHAMPS_GEST);
  const region = premierChamp(props, CHAMPS_REG);

  sortieEntites.push({
    n: nom || TYPES[type].nom,
    t: type,
    ...(gestionnaire ? { g: gestionnaire } : {}),
    ...(region ? { r: region } : {}),
    geo: geom,
  });
  parType[type] = (parType[type] || 0) + 1;
}

if (!sortieEntites.length) {
  console.error("❌ Aucun territoire reconnu. Colonnes vues dans le fichier :");
  console.error("   " + Object.keys(entites[0].properties || {}).join(", "));
  console.error("   Ajoute le bon nom de colonne dans CHAMPS_TYPE / CHAMPS_NOM en tête de ce script.");
  process.exit(1);
}

const paquet = {
  source: "Territoires fauniques structurés (TFS) — gouvernement du Québec",
  licence: "CC BY 4.0",
  url: "https://www.donneesquebec.ca/recherche/dataset/territoires-fauniques-structures",
  converti_le: new Date().toISOString().slice(0, 10),
  tolerance: TOLERANCE,
  types: TYPES,
  territoires: sortieEntites,
};

writeFileSync(sortie, JSON.stringify(paquet));

const ko = (n) => (n / 1024).toFixed(0) + " Ko";
const tailleEntree = readFileSync(entree).length;
const tailleSortie = readFileSync(sortie).length;

console.log(`\n✅ ${sortieEntites.length} territoires écrits dans ${sortie}\n`);
for (const [t, n] of Object.entries(parType).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}  ${t.padEnd(5)} ${TYPES[t].nom}`);
}
console.log(`\n   Contours : ${pointsAvant.toLocaleString("fr-CA")} points → ${pointsApres.toLocaleString("fr-CA")} (tolérance ${TOLERANCE}°)`);
console.log(`   Fichier  : ${ko(tailleEntree)} → ${ko(tailleSortie)}`);
if (ignores.typeInconnu) console.log(`   Ignorés  : ${ignores.typeInconnu} entités de type non reconnu`);
if (ignores.sansGeometrie) console.log(`   Ignorés  : ${ignores.sansGeometrie} entités sans géométrie exploitable`);
if (ignores.filtres) console.log(`   Filtrés  : ${ignores.filtres} entités hors des types demandés`);

if (tailleSortie > 3 * 1024 * 1024) {
  console.log(`\n⚠️  Plus de 3 Mo — lourd pour un cellulaire en région.`);
  console.log(`   Relance avec une tolérance plus grande, ex. --tolerance=0.004`);
}
console.log(`\n📍 Dépose le fichier dans le dépôt : TILEXMAP le détecte tout seul.`);
