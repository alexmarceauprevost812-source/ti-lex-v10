# ⚠️ agent-al — état du déploiement en production

## Le dépôt était en RETARD sur la prod — resynchronisé 2026-09-15 (v53)

Avant ce commit, `index.ts` dans le dépôt était la version **« 6 couches »**,
pendant que la prod roulait la **« 7 couches »**. Déployer le dépôt tel quel
aurait **effacé** tout ça :

| Perdu si on avait déployé le dépôt | Où |
|---|---|
| Mémoire long terme : `al_messages`, `al_memory_summary`, `buildMemoryText()`, `getFullNotes()`, `getRecentMessages()`, `saveMessagePair()` | partout |
| Consolidation auto en tâche de fond (`consolidateMemory`, `maybeAutoConsolidate`, `background()` + `EdgeRuntime.waitUntil`) | + action `consolidate_memory` |
| Action `chat_simple` (app mobile ti-lex-007) | `Deno.serve` |
| Outils `sauvegarder_note`, `rechercher_memoire`, `recherche_media` (Pexels) | `TOOLS` / `runTool` |
| `MAX_TOKENS` 8192 (le dépôt avait 4000 codé en dur) | `callAnthropic` |
| Origine CORS `alexmarceauprevost812-source.github.io` + localhost | `ALLOWED_ORIGINS` |
| 14 motifs de menace (au lieu de 6), guard à 10 tours | `THREAT_PATTERNS` |
| `logAction()` vers `al_actions_log` | — |

**Ce qui a été fait** : la version déployée a été récupérée par l'API Management,
remise dans le dépôt, PIS le patch `[MODELE]` a été appliqué par-dessus. Les 62
déclarations de la prod sont toutes là, dans le même ordre. Le dépôt est
maintenant la source de vérité — `supabase functions deploy agent-al` est
sécuritaire.

## Le patch [MODELE] (nouveau en v53)

`agent-al` ignorait complètement `body.model` : le sélecteur de modèle de
`console-web/index.html` était décoratif, tout roulait sur `claude-sonnet-4-6`.

- `MODELES_PERMIS` + `choisirModele()` — un modèle inconnu retombe sur `MODEL`
  au lieu de faire planter l'appel Anthropic.
- `callAnthropic(..., model = MODEL)` en 5e paramètre : les anciens appels
  (dont le résumeur de `consolidateMemory`) gardent le défaut.
- Les actions `chat` et `chat_simple` passent le modèle demandé.
- Nouvel événement SSE `{type:"modele", modele, demande}` pour que le front
  affiche quel modèle a répondu — pis dise si sa demande a été refusée.

## verify_jwt

`agent-al` roule à **`verify_jwt = false`** au niveau de la plateforme : c'est
son propre code qui barre l'accès (`callerId !== OWNER_USER_ID` → 403). Ne pas
mettre `true` : ça changerait le code d'erreur vu par le front.

## Règle

Si un patch est fait EN LIGNE (dashboard Supabase) hors du dépôt, reproduire
immédiatement le même changement ici. C'est la deuxième fois que cet écart
mord — la première, c'était `ai-proxy` (voir son PROD-NOTE.md).
