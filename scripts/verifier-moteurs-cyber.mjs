#!/usr/bin/env node
/**
 * Vérifie que le catalogue d'interface (js/moteurs-cyber.js) reste aligné sur
 * la bibliothèque serveur (supabase/functions/_shared/moteurs-cyber.ts).
 *
 * Les deux fichiers sont volontairement séparés — l'un est chargé par le
 * navigateur, l'autre déployé dans une Edge Function Deno — mais ils doivent
 * partager exactement les mêmes identifiants, catégories et profils.
 *
 * Usage : node scripts/verifier-moteurs-cyber.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = readFileSync(join(racine, "supabase/functions/_shared/moteurs-cyber.ts"), "utf8");
const js = readFileSync(join(racine, "js/moteurs-cyber.js"), "utf8");

const erreurs = [];

/* ── Moteurs déclarés côté serveur : chaque objet MoteurCyber commence par id ── */
const idsTs = [...ts.matchAll(/^\s{2}id:\s*"([a-z0-9_]+)",$/gm)].map((m) => m[1]);
/* ── Moteurs listés dans le registre exporté (MOTEURS: MoteurCyber[]) ────────── */
const blocRegistre = ts.match(/export const MOTEURS: MoteurCyber\[\] = \[([\s\S]*?)\n\];/);
if (!blocRegistre) erreurs.push("Registre MOTEURS introuvable dans le fichier TypeScript.");
const nomsRegistre = blocRegistre
  ? [...blocRegistre[1].matchAll(/moteur[A-Za-z0-9]+/g)].map((m) => m[0])
  : [];

/* ── Moteurs côté interface (uniquement le tableau MOTEURS) ─────────────────── */
const blocMoteursJs = js.match(/var MOTEURS = \[([\s\S]*?)\n {2}\];/);
if (!blocMoteursJs) erreurs.push("Tableau MOTEURS introuvable dans js/moteurs-cyber.js.");
const idsJs = blocMoteursJs
  ? [...blocMoteursJs[1].matchAll(/\{\s*id:\s*"([a-z0-9_]+)",\s*nom:/g)].map((m) => m[1])
  : [];

const setTs = new Set(idsTs);
const setJs = new Set(idsJs);

for (const id of setTs) {
  if (!setJs.has(id)) erreurs.push(`Moteur « ${id} » présent côté serveur mais absent de js/moteurs-cyber.js`);
}
for (const id of setJs) {
  if (!setTs.has(id)) erreurs.push(`Moteur « ${id} » présent côté interface mais absent de la bibliothèque serveur`);
}

const doublonsJs = idsJs.filter((id, i) => idsJs.indexOf(id) !== i);
if (doublonsJs.length) erreurs.push(`Identifiants dupliqués côté interface : ${[...new Set(doublonsJs)].join(", ")}`);

/* ── Chaque moteur défini doit être branché dans le registre ────────────────── */
const definis = [...ts.matchAll(/const (moteur[A-Za-z0-9]+): MoteurCyber = \{/g)].map((m) => m[1]);
for (const nom of definis) {
  if (!nomsRegistre.includes(nom)) erreurs.push(`Moteur ${nom} défini mais absent du registre MOTEURS`);
}

/* ── Profils : mêmes identifiants des deux côtés ────────────────────────────── */
const blocProfilsTs = ts.match(/export const PROFILS[\s\S]*?\n\};/);
const profilsTs = blocProfilsTs ? [...blocProfilsTs[0].matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]) : [];
const blocProfilsJs = js.match(/var PROFILS = \[([\s\S]*?)\n {2}\];/);
if (!blocProfilsJs) erreurs.push("Tableau PROFILS introuvable dans js/moteurs-cyber.js.");
const profilsJs = blocProfilsJs
  ? [...blocProfilsJs[1].matchAll(/\{\s*id:\s*"([a-z0-9_]+)",/g)].map((m) => m[1])
  : [];

for (const p of profilsTs) {
  if (!profilsJs.includes(p)) erreurs.push(`Profil « ${p} » présent côté serveur mais absent de js/moteurs-cyber.js`);
}
for (const p of profilsJs) {
  if (!profilsTs.includes(p)) erreurs.push(`Profil « ${p} » présent côté interface mais absent de la bibliothèque serveur`);
}

/* ── Profils : les moteurs référencés doivent exister ───────────────────────── */
for (const [, liste] of (blocProfilsTs?.[0] ?? "").matchAll(/moteurs:\s*\[([^\]]*)\]/g)) {
  for (const [, id] of liste.matchAll(/"([a-z0-9_]+)"/g)) {
    if (!setTs.has(id)) erreurs.push(`Profil serveur : moteur inconnu « ${id} »`);
  }
}
for (const [, liste] of (blocProfilsJs?.[1] ?? "").matchAll(/moteurs:\s*\[([^\]]*)\]/g)) {
  for (const [, id] of liste.matchAll(/"([a-z0-9_]+)"/g)) {
    if (!setJs.has(id)) erreurs.push(`Profil interface : moteur inconnu « ${id} »`);
  }
}

if (erreurs.length > 0) {
  console.error("❌ Catalogue de moteurs désynchronisé :\n");
  for (const e of erreurs) console.error("  · " + e);
  console.error(`\n${idsTs.length} moteur(s) côté serveur · ${idsJs.length} côté interface`);
  process.exit(1);
}

console.log(`✅ Catalogue aligné — ${idsTs.length} moteurs, ${profilsTs.length} profils, ${definis.length} définitions branchées.`);
