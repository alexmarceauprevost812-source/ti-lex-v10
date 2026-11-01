# Mission REA — TI-LEX v10

Branche de travail : `feature/rea-integration`. Ne pas modifier `main` directement.

## Objectif
Améliorer TI-LEX v10 avec une connexion facultative à des IA locales et une assistance REA pour analyser, proposer et vérifier les modifications de code.

## Architecture existante
- Frontend HTML/CSS/JavaScript statique, déployé sur Vercel.
- Supabase (authentification, données, fonctions Edge).
- Codex : `codex.html`, moteur `supabase/functions/tilexcode-agent`.
- Scripts UI sous `js/`.

## Phase 1 — intégration IA locale
1. Ajouter un fournisseur facultatif Ollama (adresse par défaut `http://127.0.0.1:11435`) avec détection des modèles via `/api/tags`, chat via `/api/chat`, messages d'erreur clairs et arrêt de requête.
2. Permettre de choisir le fournisseur local ou cloud, sans casser l'existant.
3. Prévoir llama.cpp (API compatible) ultérieurement, après vérification du serveur utilisé.
4. Gérer les limites CORS, HTTPS et l'accès depuis le téléphone sans exposer Ollama publiquement. Préférer un tunnel/relais authentifié avec autorisation explicite.
5. Ne jamais inclure dans GitHub des modèles GGUF personnels, noms privés, chemins locaux, clés API, conversations ni secrets.

## Phase 2 — REA / Codex
1. Examiner d'abord le protocole réel de REA avant de l'intégrer; ne pas inventer d'API.
2. Prévoir analyse en lecture seule, rapport de problèmes, proposition de patch avec diff et tests.
3. Exiger confirmation explicite avant tout commit, suppression, installation, exécution de commande ou déploiement.
4. Préserver les fonctionnalités actuelles du Codex (SCRIBE / LOUPE / FORGE, GitHub, synchronisation).

## Interface
Thème noir profond, texte blanc, boutons orange. Sur téléphone, garder le champ de saisie visible lorsque le clavier s'ouvre.

## Validation
- Tester liste des modèles, chat local, indisponibilité du serveur, absence de fuite de secrets.
- Vérifier le parcours cloud actuel et la version mobile.
- Ne fusionner sur `main` qu'après revue et tests.

REA : commence par un inventaire du code touché et propose un plan de modifications sur cette branche. N'effectue aucune action destructive ou publication sans confirmation.
