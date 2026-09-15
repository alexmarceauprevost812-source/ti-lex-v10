# ⚠️ ai-proxy — état du déploiement en production

## Nouveaux modèles Claude — 2026-09-15 ✅ DÉPLOYÉ (v64)
`ALLOWED_MODELS` dans `index.ts` accepte maintenant la génération courante :
`claude-fable-5-1`, `claude-opus-5` pis `claude-sonnet-5`, en plus de
`claude-haiku-4-5` (l'ID officiel — l'ancien ID daté `claude-haiku-4-5-20251001`
reste accepté parce que `pro.html`, `codex.html` pis `console-web` l'envoient
encore). Les pickers de `pro.html`, `codex.html`, `web.html`, `tilex-chat.html`
pis `console-web/index.html` offrent ces modèles.

Déployé le 2026-09-15 (v64) via l'API Management, avec la structure
`_shared/` conservée : l'entrypoint est `source/ai-proxy/index.ts`, donc
`../_shared/rate-limit.ts` résout. La version d'avant avait ce fichier aplati
en `./rate-limit.ts` — c'est corrigé, les deux arbres sont pareils astheure.
`index.prod-deployed.ts.txt` est resynchronisé : identique à `index.ts`.

⚠️ **verify_jwt** : la prod roule à `false` (accès anonyme au chat), mais
`supabase/config.toml` disait `true`. Un `supabase functions deploy` par la CLI
aurait cassé l'accès anonyme. Le `config.toml` est corrigé.

⚠️ **Le rate-limiting Upstash est INERTE en prod.** Les logs montrent, à chaque
appel : `[rate-limit] Redis indisponible, fail-open: TypeError: Invalid URL:
'/pipeline'` — autrement dit `UPSTASH_REDIS_REST_URL` est vide ou pas configurée.
`checkRateLimit` tombe en fail-open, donc rien bloque, mais la protection
anti-abus réseau protège rien pantoute. Pour l'activer :
`supabase secrets set UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=…`
(C'était déjà comme ça AVANT ce déploiement — pas une régression.)

Rien d'autre a changé dans la requête : le proxy envoie pas `temperature`,
`thinking`, `tool_choice` forcé ni de prefill — les trois affaires que Fable 5.1
pis Opus 5 refusent avec un 400. Donc les nouveaux modèles passent tels quels.

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
