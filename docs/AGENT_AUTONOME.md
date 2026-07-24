# TI-LEX — Agent autonome V1

## Ce qui est inclus

- Boucle planificateur → outil → observation → prochaine action
- Fournisseur Anthropic par défaut, OpenAI en option
- Maximum de 12 étapes par mission
- Trace d’exécution complète affichée dans l’interface
- Mémoire Supabase facultative et uniquement côté serveur
- HTTP limité à une liste blanche de domaines HTTPS
- Arrêt obligatoire et validation humaine pour les actions sensibles

## Variables Vercel

Variables minimales :

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

OpenAI facultatif :

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.2
```

Mémoire Supabase facultative :

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Ne jamais mettre `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` dans le navigateur ou dans `localStorage`.

## Installation de la mémoire

Exécuter le fichier `supabase/agent-memory.sql` dans le SQL Editor Supabase. La table n’a aucune politique publique : seule la fonction serveur Vercel peut y accéder avec la clé service role.

## Utilisation

Après le déploiement, ouvrir :

```text
/agent-autonome
```

L’interface appelle :

```text
POST /api/agent/run
```

Corps JSON :

```json
{
  "goal": "Analyser une documentation et proposer des améliorations",
  "provider": "anthropic",
  "maxSteps": 6,
  "agentId": "ti-lex-autonome"
}
```

## Limites de sécurité

Cette V1 ne fournit volontairement aucun shell, aucune exécution de code arbitraire, aucun accès direct au système de fichiers, aucun outil de suppression, aucune transaction financière et aucune action offensive. Les futures actions GitHub, Vercel ou Supabase devront être ajoutées sous forme d’outils étroits, journalisés et soumis à validation humaine.
