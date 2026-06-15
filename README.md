# ti-lex-AL v10

Plateforme IA quebecoise tout-en-un : chat, codex, studio, finance, securite, generation d'images.
Frontend statique pur (HTML / CSS / JS) deploye sur Vercel, backend Supabase (Auth, Edge Functions, Postgres).

> Concu et developpe par **Alex Marceau Prevost** (17 juin 1994)
> Quebec, Canada

---

## Fonctionnalites

### Chat — Agent AL
- Reponses en streaming SSE avec ecriture typewriter fluide (lente pour le texte, rapide pour le code)
- Coloration syntaxique dans les blocs de code
- Mode reflexion (balises `<reflexion>`)
- Historique de conversations sauvegarde localement
- Pieces jointes : images (vision Claude), fichiers texte/code, ZIP, dictee vocale, recherche web
- Avatar anime avec suivi des yeux
- Text-to-speech sur les reponses
- Diagrammes Mermaid rendus dans le chat

### Codex
- Interface chat dediee au code : composition en bas, code genere dans le fil
- Coloration syntaxique avec detection de secrets
- Menu lateral avec projets et historique
- Scan de projet (analyse de fichiers source)
- Deploy vers GitHub avec auto-deploy Vercel
- Error Studio : panel de diagnostic et correction d'erreurs de deploiement

### Studio
- Editeur de code integre avec coloration syntaxique
- Navigation arborescente des fichiers du projet (depuis GitHub)
- Modification et push direct vers GitHub
- Preview des fichiers source

### Finance
- Agent IA pour finances personnelles et crypto
- Ecriture typewriter multi-ligne avec effet de chevauchement 50 %
- Analyse et conseils financiers via Claude

### Securite
- Agent de cybersecurite defensive
- Autorisation SOW (Statement of Work)
- Dashboard de securite (mandats, findings, compagnies, scans)
- Module dedie dans `ti-lex-security-agent/`

### Forfaits et abonnements
- 3 plans standard : FLUX (19 $/mois), SURGE (60 $/mois), APEX (125 $/mois)
- 3 plans cybersecurite : RECON (299 $/mois), GUARDIAN (599 $/mois), SENTINEL (1199 $/mois)
- Integration Stripe Checkout via Edge Functions Supabase + Payment Links en fallback
- Suivi d'utilisation : messages/jour, messages/mois, images/mois
- Page forfaits avec fond video, theme noir et accents orange

### Image Studio
- Generation d'images via OpenAI (gpt-image-1)
- Suivi mensuel d'utilisation par plan

### PWA
- Service Worker avec network-first et cache en fallback
- Manifest pour installation sur mobile et desktop
- Icones maskable 192px et 512px

---

## Structure du projet

```
ti-lex-v10/
├── index.html                  # Page d'accueil + connexion (Supabase Auth)
├── app.html                    # Application principale (tous les modules)
├── app.js                      # Logique complete (~7900 lignes)
├── styles.css                  # Theme noir / orange / blanc
├── sw.js                       # Service Worker PWA
├── manifest.json               # Manifest PWA
├── vercel.json                 # Config Vercel (rewrites, headers securite)
├── logo.png                    # Logo ti-lex-AL
│
├── assets/
│   ├── avatar-al.mp4           # Avatar anime de l'agent
│   ├── avatar-ia.mp4           # Avatar IA
│   ├── forfaits-bg.mp4         # Video de fond page forfaits
│   ├── intro.mp4               # Video d'introduction
│   ├── login-animation.mp4     # Animation page login
│   ├── mascot-open.jpg         # Mascotte (ouverte)
│   ├── mascot-wink.jpg         # Mascotte (clin d'oeil)
│   ├── creer-agent-icon.mp4    # Icone creation d'agent
│   └── tilex-logo.png          # Logo alternatif
│
├── supabase/
│   ├── config.toml             # Configuration Supabase locale
│   ├── functions/
│   │   ├── _shared/cors.ts     # CORS partages
│   │   ├── ai-proxy/           # Proxy IA (Anthropic chat + OpenAI images)
│   │   ├── create-checkout/    # Creation de session Stripe Checkout
│   │   ├── create-portal/      # Portail client Stripe
│   │   └── stripe-webhook/     # Webhook Stripe (paiements, abonnements)
│   └── migrations/
│       ├── 0001_rate_limit.sql
│       ├── 0002_security_fixes_and_is_admin.sql
│       ├── 0003_security_schema_corrected.sql
│       ├── 0004_plan_limits_update.sql
│       ├── 0005_subscriptions_legacy.sql
│       ├── 0006_image_usage_tracking.sql
│       └── 0009_rename_plans_flux_surge_apex.sql
│
├── image-studio/               # Module generation d'images (standalone)
│
├── ti-lex-security-agent/      # Module securite
│
└── docs/                       # Documentation Loi 25
    ├── DPA_Anthropic.md
    ├── Politique_conservation.md
    ├── Registre_traitements.md
    ├── Guide_formation_employes.md
    ├── Formulaire_consentement_SOW.md
    └── Formulaire_droits_personnes.md
```

---

## Demarrage rapide

Aucune etape de build. C'est du HTML / CSS / JS pur.
Ouvrir `index.html` directement ou deployer le dossier sur Vercel.

Le deploiement Vercel se fait depuis la branche `supabase`.

---

## Architecture

```
Navigateur (app.js)
    │
    ├── Auth ──────────── Supabase Auth (email, OAuth)
    │
    ├── Chat / Codex ──── Edge Function ai-proxy ──── API Anthropic (Claude)
    │
    ├── Images ────────── Edge Function ai-proxy ──── API OpenAI (gpt-image-1)
    │
    ├── Studio ────────── GitHub API (token utilisateur) ──── lecture/ecriture fichiers
    │
    ├── Paiement ──────── Edge Function create-checkout ──── Stripe Checkout
    │                     Edge Function stripe-webhook ────── Stripe Webhooks
    │                     Payment Links Stripe (fallback)
    │
    └── Donnees ───────── Supabase Postgres (profiles, subscriptions, usage)
```

- Les cles API (Anthropic, OpenAI, Stripe) restent cote serveur dans les Edge Functions
- Le frontend envoie uniquement la cle anon JWT de Supabase
- Les Edge Functions valident le body, limitent l'usage et proxient les requetes

---

## Connexions

| Service   | Configuration                                              |
|-----------|------------------------------------------------------------|
| GitHub    | Parametres → token (scope `repo`) → depot + branche        |
| Supabase  | Parametres → URL du projet + cle anon                      |
| Stripe    | Edge Functions → `STRIPE_SECRET_KEY` (secret Supabase)     |
| Anthropic | Edge Functions → `ANTHROPIC_API_KEY` (secret Supabase)     |
| OpenAI    | Edge Functions → `OPENAI_API_KEY` (secret Supabase)        |

---

## Deploiement

### Frontend (Vercel)

Vercel deploie automatiquement depuis la branche `supabase`.
Le `vercel.json` configure les rewrites (`/` → `index.html`, `/app` → `app.html`)
et les en-tetes de securite (nosniff, SAMEORIGIN, strict-origin).

### Edge Functions (Supabase)
```bash
supabase functions deploy ai-proxy
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy create-portal
```

### Migrations
```bash
supabase db push
```

---

## Codex — Deploy et Error Studio

Le Codex permet de deployer du code directement vers GitHub :

1. Configurer le token GitHub dans Parametres (scope `repo`)
2. Selectionner le depot et la branche cible
3. Cliquer Deploy pour pousser les fichiers generes
4. Si Vercel est connecte au depot, le deploiement se fait automatiquement

**Error Studio** : quand un deploiement echoue, le panel Error Studio s'ouvre
a droite et affiche les erreurs. L'agent analyse les logs et propose des corrections.

---

## Securite

- Aucune cle API exposee dans le frontend
- CORS configure sur les Edge Functions
- En-tetes de securite Vercel (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- RLS (Row Level Security) active sur toutes les tables Supabase
- Fonctions `SECURITY DEFINER` pour les operations sensibles
- Conformite **Loi 25 du Quebec** — documentation dans `docs/`

---

## Variables d'environnement (Supabase Secrets)

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
```

Ne jamais commiter ces valeurs. Utiliser `supabase secrets set` pour les deployer.

---

**Alex Marceau Prevost** — Quebec, Canada
Donnees en region `ca-central-1`. Conforme a la Loi 25 du Quebec.
