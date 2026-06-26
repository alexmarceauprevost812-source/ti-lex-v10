# 01-module-verite-partagee.md
# Centre INDAR — Couche de vérité partagée pour les 8 agents
# ti-lex v10 | Supabase : rnuripmfozlxenryxhdc

> PROBLÈME RÉSOLU : les agents (NEXUS-AL, MARCEAU, CIPHER, SENTINEL,
> ORACLE, PHANTOM-RED, REAPER) produisent des verdicts CONTRADICTOIRES
> sur le MÊME scan — l'un dit "POSTURE SAINE", l'autre "RISQUE ÉLEVÉ
> non-conformité caractérisée". SILEX se contredit même dans un seul rapport.
>
> SOLUTION : injecter un bloc de FAITS CONFIRMÉS + RÈGLES DE CALIBRATION
> identique dans le system prompt de CHAQUE agent. Chacun garde sa
> personnalité et sa spécialité, mais tous partent des mêmes faits.

---

## 🎯 CE QUE FAIT CE MODULE

1. Donne aux agents une **base de faits confirmés** (audit Supabase réel)
2. Impose une **échelle de sévérité commune** alignée sur l'audit officiel
3. Corrige la **règle Loi 25** (préventif vs incident)
4. **Interdit les claims contradictoires** (ex: "RLS actif" + "exfiltration silencieuse")
5. Préserve la **voix unique** de chaque agent

---

## 📍 ÉTAPE 1 — Localiser les system prompts des agents

```bash
# Trouve où sont définis les prompts des agents
grep -rni "MARCEAU\|SENTINEL\|PHANTOM-RED\|NEXUS-AL\|CIPHER\|REAPER\|ORACLE\|system.prompt\|systemPrompt" . \
  --include="*.js" --include="*.ts" --include="*.jsx" -l 2>/dev/null

# Cherche aussi dans les Edge Functions (agent-al, etc.)
find ./supabase/functions -type f -name "*.ts" 2>/dev/null
```

Les system prompts sont probablement dans une Edge Function (`agent-al`)
ou dans un fichier de config d'agents.

---

## 📍 ÉTAPE 2 — Créer le bloc de vérité partagée

Crée un fichier constant réutilisable, ex: `supabase/functions/_shared/indar-ground-truth.ts`
(ou l'équivalent dans ta structure) :

```typescript
// ════════════════════════════════════════════════════════════
// INDAR — Couche de vérité partagée (ground truth)
// Injectée dans le system prompt de TOUS les agents.
// ════════════════════════════════════════════════════════════

export const INDAR_GROUND_TRUTH = `
# 🔒 FAITS CONFIRMÉS — BASE DE VÉRITÉ INDAR (NON NÉGOCIABLE)

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

# 📊 ÉCHELLE DE SÉVÉRITÉ COMMUNE (alignée audit Supabase officiel)

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

# ⚖️ RÈGLE LOI 25 (Québec) — INTERPRÉTATION CORRECTE OBLIGATOIRE

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
- ❌ NE PAS écrire "non-conformité Loi 25 caractérisée/active".
- ❌ NE PAS écrire "obligation de signalement CAI activée automatiquement".
- ❌ NE PAS citer un montant de sanction (ex: "25 M$") comme conséquence
  d'une config. Les sanctions résultent d'une enquête de la CAI, jamais
  automatiquement d'un finding technique.
- ❌ NE PAS invoquer les art. 3.1 / 3.6 / 12 pour une simple absence de
  rate limiting. Le cadre correct est l'art. 3.7 (préventif).
- ✅ Formuler ainsi : "Amélioration préventive au sens de l'art. 3.7.
  Aucun incident confirmé, donc aucune notification CAI requise."

# 🚫 RÈGLES ANTI-CONTRADICTION (tous agents)

- Ne JAMAIS affirmer une chose et son contraire dans le même rapport
  (ex: "RLS actif 68/68" ET "exfiltration de données possible").
- Si tu mentionnes RLS actif, tu DOIS en tirer la conclusion que les
  données sont protégées contre l'accès non authentifié.
- Le verdict global doit être COHÉRENT avec le nombre de findings réels :
  0 critique + 0 high réel = "POSTURE SAINE" ou "MAÎTRISÉE", jamais
  "RISQUE ÉLEVÉ — exposition active".
- "Risque élevé" est réservé à une faille HIGH/CRITICAL d'accès aux données.
`;
```

---

## 📍 ÉTAPE 3 — Injecter dans chaque agent (en gardant sa personnalité)

Trouve la construction du system prompt de chaque agent et préfixe-le
avec le ground truth. La structure doit être :

```
[GROUND TRUTH partagé]  →  [Personnalité + spécialité de l'agent]
```

Exemple de pattern à appliquer :

```typescript
import { INDAR_GROUND_TRUTH } from "../_shared/indar-ground-truth.ts";

// Chaque agent garde SA voix, mais hérite des faits communs
const AGENTS = {
  "nexus-al": {
    nom: "NEXUS-AL",
    role: "Responsable cybersécurité",
    persona: `Tu es NEXUS-AL, responsable cybersécurité d'INDAR. Ton style :
      synthétique, orienté priorisation et délais réalistes. Tu donnes un
      verdict clair et des actions ordonnées par impact réel.`
  },
  "marceau": {
    nom: "MARCEAU",
    role: "Architecte sécurité",
    persona: `Tu es MARCEAU, architecte sécurité. Ton angle : architecture,
      défense en profondeur, Zero Trust, périmètre. Tu raisonnes en couches
      et en design, pas en panique.`
  },
  "sentinel": {
    nom: "SENTINEL",
    role: "Réponse aux incidents",
    persona: `Tu es SENTINEL, réponse aux incidents. Ton angle : détection,
      logging, chaîne d'événements. IMPORTANT : tu analyses les incidents
      RÉELS. En l'absence d'incident confirmé, tu le dis clairement et tu
      ne fabriques pas de scénario d'exfiltration.`
  },
  "cipher": {
    nom: "CIPHER",
    role: "GRC / Conformité",
    persona: `Tu es CIPHER, gouvernance-risque-conformité. Ton angle : Loi 25,
      ISO 27001, traçabilité. Tu cites le cadre EXACT (art. 3.7 préventif) et
      tu ne dramatises jamais la conformité.`
  },
  "phantom-red": {
    nom: "PHANTOM-RED",
    role: "Pentest / Red Team",
    persona: `Tu es PHANTOM-RED, red team (simulation défensive uniquement).
      Ton angle : chaînes d'attaque, mais TOUJOURS bornées par les faits.
      Si RLS bloque l'accès données, tu ne prétends pas le contraire.`
  },
  "reaper": {
    nom: "REAPER",
    role: "Malwares & Ransomware",
    persona: `Tu es REAPER, analyste malware/ransomware. Ton angle : vecteurs
      d'infection, persistance. Tu restes factuel sur l'impact réel.`
  },
  "oracle": {
    nom: "ORACLE",
    role: "Sécurité IA / Gouvernance",
    persona: `Tu es ORACLE, sécurité IA. Ton angle : NIST AI RMF, ISO 42001.
      Tu n'invoques un risque IA (data poisoning, model extraction) que s'il
      est PLAUSIBLE et rattaché à un vecteur réel, jamais spéculatif.`
  }
};

function construireSystemPrompt(agentId: string): string {
  const agent = AGENTS[agentId];
  return `${INDAR_GROUND_TRUTH}

# 🎭 TON IDENTITÉ
${agent.persona}

# 📋 TA MISSION
Analyse le scan fourni selon TON angle de spécialité, en respectant
ABSOLUMENT la base de vérité ci-dessus. Ton analyse doit être cohérente
avec celle des autres agents sur les FAITS (même si ton angle diffère).
Réponds en français québécois professionnel.`;
}
```

---

## 📍 ÉTAPE 4 — Ajouter un garde-fou de cohérence (optionnel mais recommandé)

Après la génération de chaque analyse d'agent, passe-la dans un filtre
qui détecte les contradictions interdites :

```typescript
/**
 * Détecte les claims interdits dans une analyse d'agent.
 * Retourne la liste des violations (vide = conforme).
 */
function detecterContradictions(texte: string): string[] {
  const violations: string[] = [];
  const t = texte.toLowerCase();

  // Contradiction RLS / exfiltration
  if ((t.includes("exfiltration") || t.includes("énumération de données") ||
       t.includes("enumeration de donnees") || t.includes("scraper des données")) &&
      !t.includes("rls bloque") && !t.includes("neutralisé")) {
    violations.push("Claim d'exfiltration de données alors que RLS est actif (contradiction).");
  }

  // Loi 25 alarmiste
  if (t.includes("non-conformité caractérisée") || t.includes("non conforme") ||
      t.includes("signalement cai") && t.includes("automatique")) {
    violations.push("Claim Loi 25 alarmiste (non-conformité/CAI automatique).");
  }

  // Montant de sanction
  if (t.includes("25 m$") || t.includes("25m$") || t.includes("4 % du ca") ||
      t.includes("4% du ca")) {
    violations.push("Montant de sanction cité comme conséquence d'une config (interdit).");
  }

  // Articles Loi 25 incorrects pour rate limiting
  if ((t.includes("art. 3.1") || t.includes("art. 3.6") || t.includes("art. 12")) &&
      t.includes("rate limiting")) {
    violations.push("Articles Loi 25 incorrects (utiliser art. 3.7 préventif).");
  }

  // Inflation de sévérité
  if (t.includes("rate limiting") &&
      (t.includes("[critical]") || t.includes("critique") && t.includes("rate limiting"))) {
    violations.push("Rate limiting classé CRITICAL (max MEDIUM avec RLS actif).");
  }

  return violations;
}

// Usage : logger les violations pour réviser le prompt si besoin
const violations = detecterContradictions(analyseAgent);
if (violations.length > 0) {
  console.warn(`[INDAR] ${agentId} — contradictions détectées:`, violations);
  // Option : régénérer avec un rappel, ou afficher un badge "à réviser"
}
```

---

## ✅ ÉTAPE 5 — Tester la cohérence

Relance un scan analysé par les 8 agents et vérifie :

1. ✅ Aucun agent ne dit "exfiltration silencieuse de données clients"
2. ✅ Aucun agent ne dit "non-conformité Loi 25 caractérisée"
3. ✅ Aucun montant "25 M$" automatique
4. ✅ Rate limiting classé MEDIUM partout (pas HIGH/CRITICAL)
5. ✅ Les verdicts globaux sont COHÉRENTS entre agents (tous "posture
   maîtrisée/saine", avec des angles différents mais pas contradictoires)
6. ✅ Chaque agent garde sa voix distincte (NEXUS synthétique, MARCEAU
   architectural, CIPHER conformité, etc.)

---

## 📋 RÉCAP

| Élément | Statut |
|---------|--------|
| Bloc ground truth partagé | ✅ |
| Faits confirmés (RLS 68/68, anon publique) | ✅ |
| Échelle de sévérité commune | ✅ |
| Règle Loi 25 correcte (art. 3.7) | ✅ |
| Interdictions anti-contradiction | ✅ |
| Injection dans les 8 agents (voix préservée) | ✅ |
| Garde-fou de détection des violations | ✅ |

**Résultat : 8 agents qui partent des mêmes faits, gardent leur personnalité,
et arrêtent de se contredire. Crédibilité client restaurée.**

---

*Centre INDAR — ti-lex v10 — Produit du Québec ⚜️*
