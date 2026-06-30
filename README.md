# ti-lex-AL v10

**Plateforme IA tout-en-un, Produit du Québec 🍁**
Chat (Agent AL), Codex (génération de code), Communication temps réel mobile ↔ ordinateur,
Finance, Cybersécurité, génération d'images, et un système personnel privé (camion / forêt).

Frontend statique (HTML / CSS / JS vanilla, zéro build) déployé sur **Vercel**.
Backend **Supabase** : Auth, Postgres + RLS, Edge Functions (Deno), Realtime.

> Auteur : **Alex Marceau Prevost** — Saguenay–Lac-Saint-Jean, Québec
> Projet Supabase : `rnuripmfozlxenryxhdc`

---

## Table des matières

1. [Forfaits](#forfaits)
2. [Fonctionnalités](#fonctionnalités)
3. [Pages & routes](#pages--routes)
4. [Animations & thèmes](#animations--thèmes)
5. [Structure du projet](#structure-du-projet)
6. [Architecture](#architecture)
7. [Sécurité](#sécurité)
8. [PWA & mises à jour automatiques](#pwa--mises-à-jour-automatiques)
9. [Démarrage & déploiement](#démarrage--déploiement)
10. [Variables d'environnement](#variables-denvironnement-supabase-secrets)

---

## Forfaits

| Plan | Prix | Messages / fenêtre | Crédits / mois | Modèles |
|------|------|-------------------|----------------|---------|
| ESSAI | Gratuit | — | 50 | — |
| FLUX | 19,00 $/mois | 40 | 300 | Sonnet 4.6 |
| TI | 29,99 $/mois | 40 | 500 | Sonnet 4.6 |
| TI-LEX | 89,99 $/mois | 100 | 2 000 | Sonnet 4.6 |
| TI-LEX-AL | 149,99 $/mois | 200 | 5 000 | Sonnet 4.6 + Opus 4.8 |

Deux fenêtres de recharge par jour : **00h00** et **12h00** (heure de Montréal).
Plans cybersécurité disponibles sur demande (admin uniquement).

---

## Fonctionnalités

### 💬 Chat — Agent AL
- Streaming SSE avec écriture fluide (accélération progressive lettre par lettre)
- Mode réflexion (raisonnement étape par étape)
- Conversations persistantes (Supabase, RLS) : recherche, filtrage, favoris
- Pièces jointes : images, fichiers, **ZIP** (lecture du vrai contenu), photo, dictée vocale, recherche web
- Coloration syntaxique, blocs de code copiables, diagrammes Mermaid, Markdown, text-to-speech
- Avatars animés : logo TI-LEX-AL animé (utilisateur) + vidéo de l'agent
- Actions sur chaque réponse : 🧠 garder au Cerveau · ▶ écouter · 📝 résumer · 💻 **envoyer au Codex**

### 💻 Tilexcode — le Codex (`/tilexcode`)
Moteur de génération de code branché sur GitHub (Edge Function `tilexcode-agent`).
- **Pipeline ⚡ Codex** : SCRIBE (écrit) → LOUPE (analyse) → FORGE (corrige). Agents aussi lançables à la main.
- **Un seul écran** : explication de ce qui change + **diff** (lignes ajoutées/retirées seulement), pas le fichier complet réécrit
- **Tiroir gauche (☰)** : connexion repo + branche, liste des **Conversations** (repliable), bouton **← Retour à la plateforme**
- **Synchro temps réel téléphone ⇆ ordinateur** : ce que tu lances/reçois suit sur tes autres appareils (canal Supabase Realtime `codex-<uid>`, pastille « Solo / Lié »)
- **Connexion automatique** via la session de la plateforme (aucun mot de passe à retaper — seul le jeton GitHub est requis)
- Injection 💉 directe (commit) dans le repo/branche choisis

### 🖥️ Communication mobile ↔ ordinateur (`/comm`, `/communications`)
- Chat temps réel **entre tes appareils** (Supabase Realtime + présence), installable en PWA
- Pont de session automatique depuis la plateforme
- **Notifications push** (Web Push / VAPID) — un appareil en arrière-plan reçoit la notif
- `/communications` : liste de toutes tes communications, style épuré (recherche + bouton flottant)
- RLS **privée par usager** : tes messages ne sont visibles que par tes propres appareils

### 📂 Projets (`/projets`)
- Liste de tes projets (table `projects`, RLS), recherche, création rapide
- Thème noir, boutons orange, écriture blanche

### 🚛 Mon système — camion / forêt (privé, owner-only)
Système personnel de suivi de camion et de travail en forêt, **accessible uniquement par le compte propriétaire** (garde côté UI `js/tilex-prive.js` + RLS côté données).
- `/systeme` — hub (statut camion live + météo Normandin)
- `/truck` — émetteur GPS (dans le camion) · `/maison` (`/suivi`, `/truck-map`) — tableau de bord ETA / alertes / météo + carte
- `/agenda` — calendrier, paye (40 $/h puis 60 $/h après 40 h), **banque d'heures** (répartition hebdo de l'overtime)
- `/rapport` — bilan de saison + estimation chômage (vue `v_resume_saison`)
- Modules : `js/tilex-paye.js`, `js/tilex-meteo.js` (Open-Meteo), `js/tilex-core.js` (gardien d'erreurs + sync offline)

### 🔱 Finance
- **Midas** (`/midas`, `/midas-finance`) — agent finances perso + crypto
- **Bourse** (`/bourse`) — suivi marché
- Regroupés sous l'accordéon **Finances 💲** du menu

### 🛡️ Cybersécurité
- **SILEX** (`/security`) — agent défensif avec autorisation SOW, scans (recon passive, audit web, config, vulnérabilités, dark web), dashboard & historique (admin)
- **Centre INDAR** (`/centre-indar`) — 6 agents IA autonomes (NEXUS-AL, MARCEAU, CIPHER, SENTINEL, ORACLE, PHANTOM-RED en simulation 100 % légale)

### 🎨 Autres
- **Image Studio** — génération via OpenAI (gpt-image-1), suivi par plan
- **Agent Marceau** — dialogue multi-agents
- **Cerveau** — mémoire long terme (cross-session, par usager)
- **Moteur économique** — crédits par action, badge temps réel, recharge mensuelle, journal immuable (`credits_ledger`), fonctions `SECURITY DEFINER`

---

## Pages & routes

| Route | Fichier | Description |
|-------|---------|-------------|
| `/` | `index.html` | Accueil + connexion |
| `/pro`, `/app` | `pro.html` | Application principale (chat, menu, Studio) |
| `/web` | `web.html` | Plateforme / écran de connexion |
| `/tilexcode`, `/codex` | `tilexcode.html` | Le Codex |
| `/comm` | `comm/index.html` | Communication temps réel (PWA dédiée) |
| `/communications` | `communications.html` | Liste des communications |
| `/projets` | `projets.html` | Liste des projets |
| `/systeme` | `systeme.html` | Hub camion / forêt (privé) |
| `/truck` · `/maison` · `/suivi` · `/truck-map` | — | Suivi camion (privé) |
| `/agenda` · `/rapport` | — | Agenda / rapport de saison (privé) |
| `/midas` · `/midas-finance` · `/bourse` | — | Finance |
| `/security` · `/centre-indar` · `/cyber` | — | Cybersécurité |
| `/forfaits` · `/forfaits-cyber` · `/abonnement` | — | Forfaits & abonnement |

---

## Animations & thèmes

**Animation de connexion** — après une connexion réussie (sur `/web` comme sur `index.html`),
le **ti-démon bleu qui s'embrase en feu** joue par-dessus une **pluie matrix** (bleu à gauche, rouge à droite),
puis on arrive sur `pro.html`. (Remplace l'ancienne animation aux yeux rouges.)

**Menu de gauche (style app Claude)** :
- **Carré animé du ti-démon** (bleu ⇆ feu, boucle) en haut du menu
- Titre serif + items en police manuscrite (Patrick Hand), item actif en pilule
- **Animation de feu au clic** sur chaque bouton, puis **transition démon + matrix** avant d'arriver à la destination

**Thèmes** :
- 🌙 **Nuit** : fond noir, écriture blanche, accents + bouton ⚡ orange
- ☀️ **Jour** : beige (style Anthropic/Claude), **bouton orange**, écriture bien noire

Toutes les animations respectent `prefers-reduced-motion`.

---

## Structure du projet

```
ti-lex-v10/
├── index.html              # Accueil + connexion (intro démon+matrix après login → pro.html)
├── pro.html                # App principale (chat, menu Claude, Studio) — inline
├── web.html                # Plateforme / connexion (thèmes jour/nuit)
├── tilexcode.html          # Codex (un écran, diff, synchro multi-appareils, tiroir)
├── communications.html     # Liste des communications
├── projets.html            # Liste des projets
├── systeme.html · truck.html · maison.html · truck-map.html · agenda.html · rapport.html  # Système privé
├── midas*.html · bourse.html · security.html · centre-indar.html · cyber.html · forfaits*.html
├── sw.js                   # Service Worker PWA (CACHE_VERSION bumpé à chaque changement)
├── manifest.json           # Manifest PWA
├── vercel.json             # Rewrites + headers (HSTS, CSP, cache no-store pour HTML/JS/CSS/sw)
│
├── comm/                   # App de communication temps réel (PWA dédiée)
│   ├── index.html · config.js · tilex-comm.js · tilex-push-client.js · sw.js · manifest.json
│   └── supabase/functions/tilex-push/   # Edge Function d'envoi des push (VAPID)
│
├── js/
│   ├── tilex-config.js     # window.SB_URL / SB_ANON / TILEX_CONFIG (clé anon publique)
│   ├── tilex-intro.js      # Animations : intro démon+matrix, transition menu, carré animé
│   ├── tilex-prive.js      # Garde owner-only (système camion)
│   ├── tilex-core.js · tilex-paye.js · tilex-meteo.js   # Système camion/forêt
│   ├── tilex-zip.js · tilex-vocal.js · tilex-push.js · tilex-platform-theme.js
│   └── (chat, mémoire, studio, fichiers, midas, sécurité, …)
│
├── css/                    # Styles (sécurité, typewriter, fichiers, vision, …)
│
├── assets/
│   ├── tilex-demon-bleu.png · tilex-demon-feu.png   # Démon (animation connexion/menu)
│   └── logos, avatars, vidéos, intro
│
├── supabase/
│   ├── functions/          # Edge Functions (Deno) — voir liste ci-dessous
│   └── migrations/         # Schéma SQL + RLS
│
└── docs/                   # Conformité Loi 25 (Québec)
```

### Edge Functions principales

| Fonction | Rôle |
|----------|------|
| `ai-proxy` | Proxy IA (Anthropic + OpenAI) — auth + plan + crédits + rate limit |
| `agent-al` | Agent AL (streaming SSE, owner-aware) |
| `tilexcode-agent` | Moteur Codex (SCRIBE/ARCHI/SOCLE/LOUPE/FORGE) — clé Anthropic côté serveur |
| `tilex-push` | Envoi des notifications push (clés VAPID lues dans `tilex_secrets`) |
| `create-checkout` · `create-portal` · `stripe-webhook` | Paiements Stripe |
| `validate-github` · `github-proxy` | Intégration GitHub |
| `cyber-agent-al` · `scan-engine` · `tilex-gardien` | Cybersécurité / garde |
| `midas-agent` · `tilex-image` · `vocal-proxy` | Finance / images / voix |

---

## Architecture

```
Navigateur (pro.html / web.html / tilexcode / comm)
    │
    ├── Auth ─────────── Supabase Auth (email, OAuth) — session partagée entre les pages
    │
    ├── Chat / Codex ─── Edge Functions ai-proxy / tilexcode-agent ─── API Anthropic (Claude)
    │                    (auth + plan + crédits obligatoires; clés API côté serveur)
    │
    ├── Crédits ──────── consume_credits() / grant_credits() (SECURITY DEFINER)
    │                    402 Payment Required si solde insuffisant
    │
    ├── Realtime ─────── Communication (/comm) + synchro Codex (codex-<uid>)
    │
    ├── Push ─────────── Edge Function tilex-push ─── Web Push (VAPID, clés en DB verrouillée)
    │
    ├── Studio / Codex ─ GitHub API (PAT utilisateur, jamais envoyé ailleurs)
    │
    ├── Paiement ─────── Stripe Checkout + Webhooks
    │
    └── Données ──────── Supabase Postgres (RLS partout)
                         profiles, conversations, messages, projects,
                         tilex_messages/devices/push_subs, tilex_secrets,
                         truck_position, agenda_jour, voyage, rappel,
                         user_credits, credits_ledger, usage_events, user_roles, …
```

---

## Sécurité

- **Aucune clé API dans le frontend** — tout passe par les Edge Functions (clés via `Deno.env`)
- **Clé anon** (la seule clé côté client) = **publique par design**, protégée par RLS (chaque usager ne voit que ses données)
- **Clé `service_role`** : jamais côté client — uniquement dans les Edge Functions (env serveur)
- **Clé VAPID privée** : stockée côté serveur dans la table verrouillée `tilex_secrets` (RLS sans policy = service_role only), **jamais dans le repo**
- **RLS sur toutes les tables**; aucune écriture directe client sur les tables d'argent (`user_credits`, `credits_ledger`, `usage_events`)
- **Système camion/forêt** : owner-only (garde UI `tilex-prive.js` + RLS `auth.uid() = user_id`)
- Anti-XSS systématique (`textContent` / échappement), anti-injection de prompt côté Edge Functions
- Garde IA : `ai-proxy` répond 401 (non connecté) / 402 (crédits) / 403 (sans forfait)
- Headers Vercel : HSTS, CSP (Report-Only), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- `.env` / `.env.*` gitignorés (seuls les `.example` avec placeholders sont commités)
- Conformité **Loi 25 du Québec** — documentation dans `docs/`

---

## PWA & mises à jour automatiques

- **Service Worker** (`sw.js`) : cache offline + réseau-d'abord (HTML toujours frais en ligne).
  `CACHE_VERSION` est bumpé à chaque changement.
- **Auto-update au déploiement Vercel** : les pages vérifient une nouvelle version au chargement,
  **chaque minute**, et au retour sur l'onglet → rechargement automatique quand la nouvelle version prend le contrôle.
- Headers de cache : `sw.js`, `*.html`, `*.js`, `*.css` en **no-cache / must-revalidate**
  → un déploiement s'applique tout de suite (pas de cache figé d'un an).
- Notifications push : nécessite des clés VAPID (générer + stocker dans `tilex_secrets`).
  Sur iPhone, installer la PWA sur l'écran d'accueil pour recevoir les push.

---

## Démarrage & déploiement

Pas de build — HTML / CSS / JS statique.

```bash
# Serveur local
npm start                      # ou : npx serve .

# Déploiement = push Git (Vercel build & deploy auto sur la branche)
```

### Edge Functions

```bash
supabase functions deploy <nom> --project-ref rnuripmfozlxenryxhdc
# ex : ai-proxy, tilexcode-agent, tilex-push, create-checkout, stripe-webhook, …
```

### Migrations / SQL

```bash
supabase db push --project-ref rnuripmfozlxenryxhdc
```

---

## Variables d'environnement (Supabase Secrets)

À définir via `supabase secrets set` (jamais commitées) :

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # auto-injectée dans les Edge Functions
TILEX_ALLOWED_ORIGINS=https://...           # CORS du Codex (en plus de *.vercel.app / ti-lex.app)
```

Les clés **VAPID** (push) sont stockées dans la table `tilex_secrets` (lecture service_role uniquement),
pas en variable d'environnement.

Côté client, seule la **clé anon** (publique) est exposée, dans `js/tilex-config.js` et `comm/config.js`.

---

🌌 **ti-lex-AL v10** — l'aurore boréale dans ton code. **Produit du Québec** 🍁
*Alex Marceau Prevost — Saguenay–Lac-Saint-Jean*
