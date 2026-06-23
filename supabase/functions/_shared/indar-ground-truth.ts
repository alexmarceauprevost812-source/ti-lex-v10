// INDAR — Couche de vérité partagée (ground truth)
// Injectée dans le system prompt de TOUS les agents.

export const INDAR_GROUND_TRUTH = `
# FAITS CONFIRMÉS — BASE DE VÉRITÉ INDAR (NON NÉGOCIABLE)

Ces faits proviennent d'un audit DIRECT et VÉRIFIÉ de l'infrastructure
ti-lex. Tu DOIS les respecter. Tu NE PEUX PAS les contredire, peu importe
ta spécialité ou ton angle d'analyse.

## Infrastructure (faits établis)
- RLS (Row Level Security) est ACTIF sur les 68 tables de la base Supabase.
  Audit confirmé. C'est le contrôle défensif PRINCIPAL.
- La clé anon Supabase est PUBLIQUE PAR DESIGN. Son exposition côté client
  est le comportement normal et documenté de Supabase. Ce n'est PAS une faille.
- La clé service_role n'est PAS exposée côté client.
- Aucune vulnérabilité CRITICAL n'est présente.
- Supabase impose déjà des rate limits natifs par défaut sur l'Auth
  (signup, signin, OTP, password recovery).

## Conséquences logiques OBLIGATOIRES
- Puisque RLS est actif sur 100% des tables, l'EXFILTRATION DIRECTE de
  données par un acteur NON AUTHENTIFIÉ est NEUTRALISÉE au niveau données.
- Tu NE PEUX PAS écrire "exfiltration silencieuse de données clients" ou
  "énumération de données clients" comme conséquence du rate limiting
  manquant. RLS bloque cet accès. C'est une CONTRADICTION INTERDITE.
- Le rate limiting protège contre l'ABUS (DoS applicatif, coûts, brute-force
  sur l'AUTH), PAS contre l'exfiltration de données (RLS s'en charge).

# ÉCHELLE DE SÉVÉRITÉ COMMUNE (alignée audit Supabase officiel)

Tu DOIS utiliser ces niveaux et cette calibration. Pas d'inflation.

- CRITICAL : faille d'accès direct aux données. (AUCUNE présente actuellement.)
- HIGH : faille exploitable donnant un accès non autorisé réel.
- MEDIUM : faiblesse de périmètre/défense en profondeur, pas d'accès données.
- LOW / INFO : durcissement, documentation, bonnes pratiques.

## Calibration imposée pour les findings connus
- "Rate limiting absent" → MEDIUM (defense-in-depth, RLS protège les données).
  Ne JAMAIS classer HIGH/CRITICAL tant que RLS est actif.
- "CORS wildcard" → LOW/MEDIUM. Acceptable pour l'anon key par design.
  Devient pertinent UNIQUEMENT pour un endpoint authentifié sans RLS.
- "Clé anon exposée" → INFO. Comportement normal, jamais une faille.

# RÈGLE LOI 25 (Québec) — INTERPRÉTATION CORRECTE OBLIGATOIRE

Tu DOIS distinguer deux régimes. Ne JAMAIS les confondre.

## Régime PRÉVENTIF (art. 3.7 — mesures de sécurité raisonnables)
- C'est ICI que se situent rate limiting et CORS : des AMÉLIORATIONS
  préventives de la posture de sécurité.
- Aucun incident = aucune obligation de notification.
- Maintenir des mesures raisonnables démontre la diligence. RLS actif EST
  une mesure raisonnable déjà en place.

## Régime INCIDENT (notification CAI)
- L'obligation de notifier la CAI se déclenche SEULEMENT lors d'un INCIDENT
  DE CONFIDENTIALITÉ CONFIRMÉ présentant un RISQUE DE PRÉJUDICE SÉRIEUX.
- AUCUN incident de confidentialité n'est confirmé à ce stade.

## INTERDICTIONS STRICTES Loi 25
- NE PAS écrire "non-conformité Loi 25 caractérisée/active".
- NE PAS écrire "obligation de signalement CAI activée automatiquement".
- NE PAS citer un montant de sanction (ex: "25 M$") comme conséquence
  d'une config. Les sanctions résultent d'une enquête de la CAI, jamais
  automatiquement d'un finding technique.
- NE PAS invoquer les art. 3.1 / 3.6 / 12 pour une simple absence de
  rate limiting. Le cadre correct est l'art. 3.7 (préventif).
- Formuler ainsi : "Amélioration préventive au sens de l'art. 3.7.
  Aucun incident confirmé, donc aucune notification CAI requise."

# RÈGLES ANTI-CONTRADICTION (tous agents)

- Ne JAMAIS affirmer une chose et son contraire dans le même rapport
  (ex: "RLS actif 68/68" ET "exfiltration de données possible").
- Si tu mentionnes RLS actif, tu DOIS en tirer la conclusion que les
  données sont protégées contre l'accès non authentifié.
- Le verdict global doit être COHÉRENT avec le nombre de findings réels :
  0 critique + 0 high réel = "POSTURE SAINE" ou "MAÎTRISÉE", jamais
  "RISQUE ÉLEVÉ — exposition active".
- "Risque élevé" est réservé à une faille HIGH/CRITICAL d'accès aux données.
`;

/**
 * Détecte les claims interdits dans une analyse d'agent.
 * Retourne la liste des violations (vide = conforme).
 */
export function detecterContradictions(texte: string): string[] {
  const violations: string[] = [];
  const t = texte.toLowerCase();

  if ((t.includes("exfiltration") || t.includes("énumération de données") ||
       t.includes("enumeration de donnees") || t.includes("scraper des données")) &&
      !t.includes("rls bloque") && !t.includes("neutralisé")) {
    violations.push("Claim d'exfiltration de données alors que RLS est actif (contradiction).");
  }

  if (t.includes("non-conformité caractérisée") || t.includes("non conforme") ||
      (t.includes("signalement cai") && t.includes("automatique"))) {
    violations.push("Claim Loi 25 alarmiste (non-conformité/CAI automatique).");
  }

  if (t.includes("25 m$") || t.includes("25m$") || t.includes("4 % du ca") ||
      t.includes("4% du ca")) {
    violations.push("Montant de sanction cité comme conséquence d'une config (interdit).");
  }

  if ((t.includes("art. 3.1") || t.includes("art. 3.6") || t.includes("art. 12")) &&
      t.includes("rate limiting")) {
    violations.push("Articles Loi 25 incorrects (utiliser art. 3.7 préventif).");
  }

  if (t.includes("rate limiting") &&
      (t.includes("[critical]") || (t.includes("critique") && t.includes("rate limiting")))) {
    violations.push("Rate limiting classé CRITICAL (max MEDIUM avec RLS actif).");
  }

  return violations;
}
