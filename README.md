# ti-lex-AL v10

Plateforme IA tout-en-un. Chat, Codex, Studio, Finance, Cybersecurite, Generation d'images.
Frontend statique (HTML / CSS / JS) sur Vercel, backend Supabase (Auth, Edge Functions, Postgres).

> **Alex Marceau Prevost** — Quebec, Canada

---

## Forfaits

| Plan | Prix | Messages / fenetre | Modeles |
|------|------|-------------------|---------|
| TI | 29,99 $/mois | 40 | Sonnet 4.6 |
| TI-LEX | 89,99 $/mois | 100 | Sonnet 4.6 |
| TI-LEX-AL | 149,99 $/mois | 200 | Sonnet 4.6 + Opus 4.8 |

Plans cybersecurite disponibles sur demande (admin uniquement).
Deux fenetres de recharge par jour : 08h00-20h00 et 20h00-08h00 (heure de l'Est).

---

## Fonctionnalites

### Chat — Agent AL
- Streaming SSE avec ecriture typewriter (lent pour le texte, rapide pour le code)
- Mode reflexion (raisonnement etape par etape)
- Conversations persistantes (Supabase) avec recherche et filtrage
- Mode Maitre (admin : reponses directes) / Mode Standard (clarification d'abord)
- Pieces jointes : images, fichiers, ZIP, dictee vocale, recherche web
- Coloration syntaxique, diagrammes Mermaid, text-to-speech
- Animation gold flash a la fin du streaming
- Bouton Codex sur chaque reponse pour envoyer vers le pipeline de code

### Codex
- Interface de generation de code avec deploy GitHub + auto-deploy Vercel
- Error Studio : diagnostic et correction d'erreurs de deploiement
- Pipeline Chat → Codex : table `codex_queue`, Edge Function, listener local

### Studio
- Editeur avec navigation arborescente des fichiers (depuis GitHub)
- Modification et push direct vers la branche cible

### Finance
- Agent IA pour finances personnelles et crypto

### Cybersecurite (SILEX)
- Agent defensif avec autorisation SOW
- Scans : reconnaissance passive, audit web, config, vulnerabilites, dark web
- Dashboard et historique — admin uniquement

### Centre INDAR
- Systeme de cybersecurite autonome avec 6 agents IA
- NEXUS-AL (supervision), MARCEAU (architecture), CIPHER (conformite), SENTINEL (incidents), ORACLE (securite IA), PHANTOM-RED (pentest simule)
- Mode EN MARCHE : surveillance continue autonome avec flux d'evenements en temps reel
- PHANTOM-RED : pentester en mode SIMULATION (100% legal, aucun systeme reel touche)
- 3 forfaits cyber : SENTINELLE (97$/mois), FORTERESSE (297$/mois), COMMANDEMENT (697$/mois)

### Image Studio
- Generation via OpenAI (gpt-image-1)
- Suivi d'utilisation par plan

### Agent Marceau
- Dialogue multi-agents en 4 phases

---

## Structure du projet

```
ti-lex-v10/
├── index.html                  # Page d'accueil + connexion
├── pro.html                    # Application principale (~5800 lignes inline)
├── forfaits.html               # Page forfaits IA (Stripe Payment Links)
├── forfaits-cyber.html         # Page forfaits cybersecurite (SENTINELLE/FORTERESSE/COMMANDEMENT)
├── centre-indar.html           # Centre INDAR — dashboard cybersecurite 6 agents
├── cyber.html                  # Page cybersecurite (landing)
├── choose.html                 # Ecran de choix d'interface
├── sw.js                       # Service Worker PWA
├── manifest.json               # Manifest PWA
├── vercel.json                 # Rewrites + headers securite
├── package.json                # Scripts : dev, scan, push, deploy, codex:listen
│
├── js/
│   └── agent-marceau.js        # Module agent multi-phases
├── css/
│   └── agent-marceau.css       # Styles agent Marceau
│
├── scripts/
│   ├── codex-listener.js       # Polle codex_queue, ecrit les .md
│   ├── scan-avant-deploy.sh    # Scan pre-deploy (secrets, JS, HTML)
│   └── push-securise.sh        # Git push avec scan
│
├── assets/                     # Videos, logos, avatars
│
├── supabase/
│   ├── functions/
│   │   ├── ai-proxy/           # Proxy IA (Anthropic + OpenAI) — auth + plan obligatoires
│   │   ├── check-abonnement/   # Verification abonnement (pre-check frontend)
│   │   ├── create-checkout/    # Session Stripe Checkout
│   │   ├── create-portal/      # Portail client Stripe
│   │   ├── stripe-webhook/     # Webhook Stripe
│   │   ├── receive-codex-instruction/ # Reception instructions Chat → Codex
│   │   ├── validate-github/    # Validation PAT GitHub (user_connections)
│   │   ├── validate-supabase/  # Validation credentials Supabase externes
│   │   ├── billing-status/     # Statut facturation
│   │   ├── github-proxy/       # Proxy GitHub
│   │   ├── vercel-proxy/       # Proxy Vercel
│   │   ├── marceau-reflection/ # Reflexion agent Marceau
│   │   ├── verify-neq/         # Verification NEQ
│   │   └── test-key/           # Test de cle API
│   └── migrations/             # 20 migrations (0001 → 0020)
│
├── ti-lex-security-agent/      # Module securite standalone
├── image-studio/               # Module generation d'images
│
└── docs/                       # Documentation Loi 25 du Quebec
    ├── DPA_Anthropic.md
    ├── Politique_conservation.md
    ├── Registre_traitements.md
    ├── Guide_formation_employes.md
    ├── Formulaire_consentement_SOW.md
    └── Formulaire_droits_personnes.md
```

---

## Architecture

```
Navigateur (pro.html)
    │
    ├── Auth ──────────── Supabase Auth (email, OAuth)
    │
    ├── Garde IA ──────── Edge Function check-abonnement
    │                     (bloque si non connecte ou sans forfait)
    │
    ├── Chat / Codex ──── Edge Function ai-proxy ──── API Anthropic (Claude)
    │                     (auth + plan obligatoires, rate limit)
    │
    ├── Images ────────── Edge Function ai-proxy ──── API OpenAI (gpt-image-1)
    │
    ├── Studio ────────── GitHub API (PAT utilisateur)
    │
    ├── Paiement ──────── Edge Function create-checkout ──── Stripe Checkout
    │                     Edge Function stripe-webhook ────── Stripe Webhooks
    │                     Payment Links directs (forfaits.html)
    │
    ├── Connexions ────── Edge Functions validate-github / validate-supabase
    │                     Table user_connections (RLS par utilisateur)
    │
    └── Donnees ───────── Supabase Postgres
                          (profiles, conversations, messages, codex_queue,
                           user_connections, ai_usage, user_roles)
```

---

## Securite

- Aucune cle API dans le frontend — tout passe par les Edge Functions
- **Garde IA** : `ai-proxy` refuse 401 (non connecte) / 403 (sans forfait) — la verification est server-side
- Auth obligatoire pour toute requete IA (pas d'acces anonyme)
- RLS sur toutes les tables (chaque utilisateur voit uniquement ses donnees)
- `is_admin()` en SECURITY DEFINER basee sur `user_roles` (pas un simple champ)
- CORS sur toutes les Edge Functions
- Headers Vercel : `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Plans cyber admin-only tant que l'avocat n'a pas signe
- Conformite **Loi 25 du Quebec** — documentation dans `docs/`

---

## Demarrage rapide

Pas de build. HTML / CSS / JS statique.

```bash
# Serveur local
npm start

# Ecouter les instructions Codex
npm run codex:listen

# Scan pre-deploy + push
npm run deploy
```

### Deploiement Vercel

Le `vercel.json` configure les rewrites :
- `/` → `index.html`
- `/app` → `pro.html`
- `/forfaits` → `forfaits.html`
- `/forfaits-cyber` → `forfaits-cyber.html`
- `/centre-indar` → `centre-indar.html`

### Edge Functions

```bash
supabase functions deploy ai-proxy --project-ref rnuripmfozlxenryxhdc
supabase functions deploy check-abonnement --project-ref rnuripmfozlxenryxhdc
supabase functions deploy create-checkout --project-ref rnuripmfozlxenryxhdc
supabase functions deploy stripe-webhook --project-ref rnuripmfozlxenryxhdc
supabase functions deploy validate-github --project-ref rnuripmfozlxenryxhdc
supabase functions deploy validate-supabase --project-ref rnuripmfozlxenryxhdc
supabase functions deploy receive-codex-instruction --project-ref rnuripmfozlxenryxhdc
```

### Migrations

```bash
supabase db push --project-ref rnuripmfozlxenryxhdc
```

---

## Connexions

| Service | Configuration |
|---------|---------------|
| GitHub | Parametres → PAT (scopes `repo`, `workflow`) — stocke dans `user_connections` |
| Supabase | Parametres → URL + cle anon (projet externe) — stocke dans `user_connections` |
| Stripe | Edge Functions → `STRIPE_SECRET_KEY` (secret Supabase) |
| Anthropic | Edge Functions → `ANTHROPIC_API_KEY` (secret Supabase) |
| OpenAI | Edge Functions → `OPENAI_API_KEY` (secret Supabase) |

---

## Variables d'environnement (Supabase Secrets)

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://rnuripmfozlxenryxhdc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
```

Ne jamais commiter ces valeurs. Utiliser `supabase secrets set` pour les deployer.

---

**Alex Marceau Prevost** — Quebec, Canada
Donnees en region `ca-central-1`. Conforme a la Loi 25 du Quebec.
