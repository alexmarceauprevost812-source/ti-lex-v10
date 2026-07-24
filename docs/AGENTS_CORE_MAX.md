# TI-LEX Agent Core MAX

## Objectif

TI-LEX-AL, Marceau et Prevost utilisent désormais le même noyau technique.

Ils conservent des noms, avatars et styles de communication différents, mais disposent des mêmes capacités :

- lecture de l’arbre et des fichiers GitHub;
- lecture et modification Supabase avec RLS;
- inspection du schéma des tables;
- création de fichiers pour le Codex/Studio;
- mémoire partagée;
- boucle autonome jusqu’à 20 étapes;
- auto-correction après une erreur d’outil;
- journal complet des étapes et résultats.

## Accès JavaScript

```js
const tilex = TilexAgentCoreMAX.getAgent('ti-lex-al');
const marceau = TilexAgentCoreMAX.getAgent('marceau');
const prevost = TilexAgentCoreMAX.getAgent('prevost');

const resultat = await marceau.run('Analyse le dépôt et propose les corrections nécessaires.');
```

Alias disponibles :

```js
TILEX_AL_MAX
MARCEAU_MAX
PREVOST_MAX
TilexAgentsMAX
```

L’ancien objet `PREVOST` reste compatible et délègue maintenant au noyau MAX.

## Outils partagés

- `github_list_files`
- `github_read_file`
- `supabase_select`
- `inspecter_schema`
- `supabase_insert`
- `supabase_update`
- `supabase_delete`
- `memory_read`
- `memory_write`
- `ecrire_code`
- `demander_a_alex`
- `finish`

## Protections

Les trois agents ont les mêmes garde-fous :

- approbation avant toute écriture ou suppression Supabase;
- filtre obligatoire pour `UPDATE` et `DELETE`;
- blocage des tables de secrets et des tables système;
- blocage des anciennes tables crypto;
- lecture des vrais fichiers avant modification;
- aucune clé secrète exposée dans le navigateur;
- authentification et RLS toujours respectées.

## Configuration

Le noyau reprend automatiquement :

- `window.AI_PROXY`;
- `window.SB_URL`;
- `window.SB_ANON`;
- le jeton de session Supabase du navigateur.

Configuration manuelle facultative :

```js
TilexAgentCoreMAX.configure({
  MODEL: 'claude-sonnet-5',
  MAX_STEPS: 20,
  DEBUG: false,
});
```
