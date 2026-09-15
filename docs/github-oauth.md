# Connecter GitHub sans coller de token

Avant : l'usager devait aller se fabriquer un *Personal Access Token* sur
GitHub pis le coller dans le Codex. Astheure : il clique **🔗 Connecter
GitHub**, il atterrit sur github.com, il autorise, pis il revient connecté.
Le jeton se rend **jamais** dans le navigateur.

---

## 1. Créer la GitHub App (5 minutes, une seule fois)

`github.com` → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**

| Champ | Quoi mettre |
|---|---|
| **GitHub App name** | `ti-lex` (le nom doit être unique sur GitHub) |
| **Homepage URL** | `https://ti-lex-al.com` |
| **Callback URL** | `https://ti-lex-al.com/github-retour` |
| **Request user authorization (OAuth) during installation** | ☑️ **coché** |
| **Expire user authorization tokens** | ☑️ **coché** (recommandé — c'est ce qui donne les jetons 8 h + refresh) |
| **Webhook → Active** | ☐ décoché (on en a pas besoin) |
| **Where can this app be installed?** | *Only on this account* |

**Permissions** → *Repository permissions* :

| Permission | Niveau | Pourquoi |
|---|---|---|
| **Contents** | Read and write | lire l'arbre pis les fichiers, pis pousser du code |
| **Metadata** | Read-only (obligatoire, coché tout seul) | lister les repos pis les branches |

> Mets **Read-only** sur Contents si tu veux que le Codex lise seulement.
> `pushFile` dans `github-proxy` va répondre 403, le reste marche pareil.

Une fois créée : note le **Client ID**, pis clique **Generate a new client
secret** (tu le verras juste une fois).

## 2. Donner les clés à Supabase

```bash
supabase secrets set \
  GITHUB_OAUTH_CLIENT_ID=Iv1.xxxxxxxxxxxx \
  GITHUB_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  GITHUB_OAUTH_REDIRECT_URI=https://ti-lex-al.com/github-retour \
  --project-ref rnuripmfozlxenryxhdc
```

⚠️ Le **secret** vit juste là. Il rentre jamais dans le dépôt, jamais dans
une page, jamais dans une variable Vercel côté client.

⚠️ `GITHUB_OAUTH_REDIRECT_URI` doit matcher **au caractère près** la Callback
URL enregistrée sur github.com, sinon GitHub refuse l'échange.

## 3. Déployer

```bash
supabase functions deploy github-oauth --project-ref rnuripmfozlxenryxhdc
supabase functions deploy github-proxy --project-ref rnuripmfozlxenryxhdc
```

(La migration `0063_github_oauth.sql` crée les deux tables — voir plus bas.)

## 4. Installer l'app sur tes repos

Va sur la page publique de l'app (`github.com/apps/<ton-app>`) → **Install** →
choisis **les repos que ti-lex a le droit de voir**. C'est là le gros gain
d'une GitHub App : c'est pas tout ton compte, c'est les repos que tu pointes.

---

## Comment ça marche

```
Codex                  github-oauth            github.com
  │  action:"start"  →      │
  │  ← {url}                │  (range un state à usage unique, 10 min)
  │──────────── location.href = url ──────────→ │
  │                                             │  l'usager autorise
  │  ← /github-retour?code=…&state=… ───────────│
  │  action:"callback"  →   │
  │                         │── code + client_secret ──→ │
  │                         │  ← access_token + refresh  │
  │  ← {ok, username}       │  (rangé dans github_oauth_tokens)
```

Après ça, le Codex passe par **`github-proxy`** avec juste son JWT Supabase.
C'est `github-proxy` qui va chercher le jeton côté serveur (pis le rafraîchit
tout seul quand les 8 h sont écoulées, via `_shared/github-token.ts`).

### Les tables

| Table | Ce qu'il y a dedans | Qui peut lire |
|---|---|---|
| `github_oauth_states` | le `state` anti-CSRF, 10 min, usage unique | **personne** sauf le `service_role` |
| `github_oauth_tokens` | `access_token`, `refresh_token`, expirations | **personne** sauf le `service_role` |
| `user_connections` | juste l'affichage : `github_connected`, `github_username`, avatar | l'usager (RLS) |

Les deux nouvelles tables ont **RLS activée pis aucune politique** — c'est
volontaire. Le `service_role` (les edge functions) contourne la RLS; tout le
reste (`anon`, `authenticated`) est barré au complet. Donc même avec la clé
anon pis une session valide, le navigateur peut pas lire un jeton.

### L'ancien chemin est encore là

`_shared/github-token.ts` essaie dans cet ordre :

1. `github_oauth_tokens` (OAuth, rafraîchi au besoin)
2. `user_connections.github_access_token` (l'ancien PAT collé à la main)

Pis dans le Codex, si aucun jeton serveur existe, ça retombe sur
`/api/github-read` avec le PAT gardé sur l'appareil (menu ⋮ → *…plutôt par
token (avancé)*). Rien casse pendant la transition.

---

## 🔒 L'ancien PAT est barré au navigateur (migration 0064)

`user_connections.github_access_token` (le vieux PAT collé à la main) est plus
lisible par le client. Prouvé dans le rôle `authenticated` :

| Requête | Résultat |
|---|---|
| `select *` | **bloquée** |
| `select github_access_token` | **bloquée** |
| les colonnes que `pro.html` utilise | passe |

### Le piège Postgres

Un `revoke select (colonne)` fait **rien** tant que le `GRANT` au niveau
**table** existe — le privilège de table couvre toutes les colonnes. Faut :

```sql
revoke select on public.user_connections from anon, authenticated;
grant  select (…toutes les colonnes sauf le jeton…) on public.user_connections
  to anon, authenticated;
```

### Deux affaires à retenir

1. **`select *` sur `user_connections` plante côté client.** Toute nouvelle
   requête doit lister ses colonnes. `pro.html:chargerConnexions()` a été
   changé pour ça.
2. **Une colonne ajoutée plus tard aura pas le grant** tant que le bloc de la
   migration 0064 est pas rejoué. C'est fail-closed — c'est voulu.

`supabase_anon_key` reste lisible **exprès** : une clé anon est publique par
design (protégée par la RLS du projet visé), pis `pro.html` s'en sert côté
client pour parler au projet Supabase de l'usager.
