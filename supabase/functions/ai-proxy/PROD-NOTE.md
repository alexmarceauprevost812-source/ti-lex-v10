# ⚠️ ai-proxy — état du déploiement en production

## v43 (correctif CORS) — 2026-06-27
Le préflight CORS bloquait l'en-tête `apikey` envoyé par les clients
(codex/web/pro) → POST refusé par le navigateur → « Failed to fetch ».
Corrigé : `Access-Control-Allow-Headers` inclut maintenant
`authorization, x-client-info, apikey, content-type, x-anthropic-key`
(aligné sur github-proxy). Seule la ligne CORS a changé ; aucun verrou
d'abonnement ajouté. Snapshot exact : `index.prod-deployed.ts.txt`.

## Ce qui tourne EN LIGNE (Supabase, version 42+)
Une version **chirurgicale** basée sur l'ancienne version en ligne, à laquelle on a
ajouté **uniquement** :
- les outils boursiers d'AL (`get_stock_quote`, `get_company_profile`) exécutés
  côté serveur via `FMP_API_KEY` ;
- la boucle d'outils en **streaming temps réel** ;
- le flag `web_search` (recherche web Anthropic).

Comportement conservé tel quel : **accès anonyme permis**, modèle défaut
`claude-opus-4-8`, CORS `*`, rate-limit par usage quotidien.
👉 **PAS** de verrou d'abonnement.

Le code source exact de cette version est récupérable via Supabase
(`get_edge_function ai-proxy`) ou dans l'historique de cette branche
(`/scratchpad/ai-proxy-surgical.ts` au moment du déploiement).

## Ce qu'il y a dans le DÉPÔT (`index.ts`)
Une version **plus complète** (refactor `_shared`, validation de plan, etc.) qui
**EXIGE une connexion + un abonnement valide** (sinon 403 `sans_abonnement`),
modèle de repli `claude-sonnet-4-6`.

## ⚠️ Piège à éviter
Faire `supabase functions deploy ai-proxy` depuis le dépôt déploierait la version
COMPLÈTE → **activerait le verrou d'abonnement** et pourrait bloquer les comptes
non-abonnés. Ne le faire que si c'est volontaire.
