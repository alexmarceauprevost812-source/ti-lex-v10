# ti-lex-AL v10

Plateforme IA quebecoise — theme noir, ecriture blanche, accents orange.
Agent **AL** (propulse par Claude), un **Codex** style editeur, un mode **Securite**
defensif, un **Agent Finance** (finances personnelles & crypto) et des **Parametres** avec connexions (GitHub, Supabase...).

> Concu et developpe par **Alex Marceau Prevost** (17 juin 1994)
> Fait au Quebec, Canada

## ✨ Fonctionnalités

- **Chat Agent AL** — réponses en streaming fluide (effet typewriter lettre par
  lettre), mode réflexion, conversations sauvegardées localement.
- **Pièces jointes** — bouton `+` pour joindre **images** (vision Claude),
  **fichiers** texte/code, **ZIP**, **dictée vocale** (micro) et **recherche web**.
- **Codex** — interface façon chat : composer en bas, code généré dans le fil
  avec coloration syntaxique, menu latéral (projets + historique).
- **Connexions** (Paramètres) — **GitHub** (token → dépôts → branche → fichiers)
  et **Supabase** (URL + clé), persistées dans le navigateur.
- **Sécurité** — agent défensif avec autorisation SOW (voir `ti-lex-security-agent/`).

## 📁 Structure

```
ti-lex-v10/
├── index.html            # Page d'accueil + connexion (Supabase Auth)
├── app.html              # Application principale (Chat, Codex, Sécurité, Paramètres)
├── styles.css            # Thème + tous les styles
├── app.js                # Logique de l'app (streaming, connexions, pièces jointes)
├── logo.png              # Logo officiel ti-lex-AL
├── package.json          # Scripts de dev (serveur statique)
├── vercel.json           # Configuration de déploiement Vercel
├── .env.example          # Variables d'environnement (exemple)
└── ti-lex-security-agent/ # Module Next.js + Supabase de l'agent de sécurité
```

## 🚀 Démarrage rapide

```bash
# Servir le front statique en local
npm run dev
# → http://localhost:5173
```

Aucune étape de build : c'est du HTML/CSS/JS pur. Tu peux aussi ouvrir
`index.html` directement, ou déployer le dossier tel quel sur Vercel.

Les appels a Claude passent par l'Edge Function Supabase `ai-proxy`.
Aucune cle API n'est exposee dans le frontend.

## 🔌 Connexions

| Service   | Comment                                                        |
|-----------|----------------------------------------------------------------|
| GitHub    | Paramètres → token (scope `repo`) → choisis dépôt + branche    |
| Supabase  | Paramètres → URL du projet + clé publishable                   |

## 🛡️ Module Sécurité

L'agent de cybersécurité défensive vit dans `ti-lex-security-agent/`
(Next.js + Edge Function Supabase + migrations). Voir son
[README dédié](ti-lex-security-agent/README.md) pour le déploiement.

## ☁️ Déploiement

```bash
# Vercel (front statique)
vercel deploy
```

Le `vercel.json` configure les en-têtes de sécurité et les routes
(`/` → `index.html`, `/app` → `app.html`).

---

Donnees en region `ca-central-1`. Concu pour la conformite **Loi 25**.

---

**Alex Marceau Prevost** — 17 juin 1994 — Quebec, Canada
Fait au Quebec
