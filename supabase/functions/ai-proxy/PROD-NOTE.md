# ⚠️ ai-proxy — état du déploiement en production

## v54 (outil analyser_journal_securite) — 2026-07-20
`index.ts` et `index.prod-deployed.ts.txt` sont maintenant **identiques** —
le repo était en retard sur la prod (il manquait la mémoire long terme
[CERVEAU] déployée en v45+, jamais reportée dans le dépôt). Synchronisé au
complet plutôt que de perpétuer l'écart repo/déployé, en plus d'ajouter
l'outil `analyser_journal_securite` (relaie vers l'edge function
`log-analyst`, émet `{type:"log_report", report:{...}}` en SSE pour que
pro.html affiche le rapport via `TilexLogAnalyst.afficher()`).

Comportement conservé : accès anonyme permis, modèle défaut
`claude-opus-4-8`, CORS `*`, rate-limit par usage quotidien (200 chat/jour,
20 image/jour) — **PAS** de verrou d'abonnement.

## ⚠️ Piège historique (RÉSOLU au 2026-07-20)
Avant ce patch, `index.ts` divergeait de la version déployée dans les DEUX
sens à la fois : le dépôt avait déjà retiré le vieux verrou d'abonnement
(bonne nouvelle) mais n'avait jamais reçu la mémoire longue durée [CERVEAU]
ajoutée directement en prod (mauvaise nouvelle — un déploiement depuis le
dépôt aurait fait RÉGRESSER la mémoire). Les deux fichiers sont maintenant
la même source de vérité — donc `supabase functions deploy ai-proxy` depuis
le dépôt est de nouveau sécuritaire. Si un futur patch est fait EN LIGNE
directement (hors dépôt), reproduire immédiatement le même changement ici
pour ne pas recréer cet écart.
