# 00-README-coherence-agents.md
# Centre INDAR — Cohérence des 8 agents
# ti-lex v10 | Supabase : rnuripmfozlxenryxhdc

---

## 🎯 LE PROBLÈME RÉSOLU

Tes 8 agents (NEXUS-AL, MARCEAU, CIPHER, SENTINEL, ORACLE, PHANTOM-RED,
REAPER) analysaient le MÊME scan mais donnaient des verdicts CONTRADICTOIRES :

| Agent | Ce qu'il disait | Correct ? |
|-------|-----------------|-----------|
| NEXUS-AL | "POSTURE SAINE", art. 3.7 préventif | ✅ OUI |
| CIPHER | Reconnaît aucun incident + art. 3.7 | ✅ OUI |
| SENTINEL | "RISQUE ÉLEVÉ", "non-conformité caractérisée" | ❌ NON |
| REAPER | "signalement CAI activé automatiquement" | ❌ NON |
| SILEX | Se contredit DANS son propre rapport | ❌ NON |

**Deux erreurs récurrentes :**
1. "Exfiltration silencieuse de données" → CONTREDIT RLS actif 68/68 tables
2. "Non-conformité Loi 25 / 25 M$ / CAI automatique" → FAUX (préventif, art. 3.7)

---

## 📦 CONTENU

| Fichier | Rôle |
|---------|------|
| `00-README-coherence-agents.md` | Ce fichier |
| `01-module-verite-partagee.md` | Le module ground-truth + injection dans les agents |

---

## 📋 ORDRE D'EXÉCUTION

1. Lire ce README
2. Appliquer `01-module-verite-partagee.md` :
   - Créer le bloc `INDAR_GROUND_TRUTH` partagé
   - L'injecter dans le system prompt des 8 agents (devant leur personnalité)
   - Ajouter le garde-fou `detecterContradictions()`
3. Relancer un scan multi-agent et vérifier la cohérence

---

## 🔑 PRINCIPE CLÉ

Chaque agent **garde sa personnalité et son angle** :
- NEXUS-AL = synthétique, priorisation
- MARCEAU = architecture, Zero Trust
- SENTINEL = incidents, détection
- CIPHER = conformité, Loi 25
- PHANTOM-RED = red team
- REAPER = malware
- ORACLE = sécurité IA

…mais **tous partent des MÊMES faits confirmés** et respectent les MÊMES
règles de calibration (sévérité, Loi 25). Diversité d'angle ✅,
contradiction de faits ❌.

---

## ⚠️ FAITS DE RÉFÉRENCE (le coeur du module)

Ces faits viennent de l'audit DIRECT de ton projet Supabase :
- ✅ RLS actif sur 68/68 tables → exfiltration directe NEUTRALISÉE
- ✅ Clé anon publique par design → pas une faille
- ✅ 0 vulnérabilité CRITICAL
- ✅ Rate limiting = MEDIUM (defense-in-depth), pas HIGH
- ✅ Loi 25 = régime PRÉVENTIF (art. 3.7), aucun incident confirmé

---

*Centre INDAR — ti-lex v10 — Produit du Québec ⚜️*
