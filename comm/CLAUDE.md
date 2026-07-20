# CLAUDE.md — ti-lex v10

> Contexte pour Claude Code. Lis ça avant de toucher au code.

## C'est quoi ti-lex

**ti-lex** (toujours en minuscules, avec trait d'union) est une plateforme propulsée par l'IA avec une identité Québécoise forte, enracinée dans la région du **Saguenay–Lac-Saint-Jean**. Identité publique : **Produit du Québec** 🍁.

Ce dépôt-ci, **ti-lex v10**, c'est le système de **communication temps réel mobile ↔ ordinateur** : du clavardage instantané entre appareils, installable comme PWA, avec notifications push.

## Comment me parler

Réponds en **français québécois informel (joual)**. Écriture phonétique pis naturelle, comme on jase pour vrai. Pas de ton corporatif raide.

## Règles non-négociables

- Le nom de la plateforme s'écrit **toujours** `ti-lex` (minuscules, trait d'union). Jamais "Ti-Lex", "TiLex" ou "ti lex".
- L'auteur c'est **Alex Marceau Prevost** — toujours cette orthographe.
- Dans le contenu public, utilise **"Produit du Québec"**. Ne référence pas d'adresse personnelle.
- Projet Supabase ti-lex-al : **`rnuripmfozlxenryxhdc`**.

## Stack pis philosophie de code

- **Vanilla JS zéro-dépendance** côté client — même esprit que `TilexFX` (le moteur d'animation maison). Pas de framework lourd (pas de React/Vue ici). Si une dépendance est vraiment nécessaire (ex: le client Supabase), on l'injecte proprement plutôt que de la coupler.
- **Supabase** pour le backend : Realtime (canaux/broadcast/présence), Postgres (persistance), Auth, Edge Functions (Deno).
- **PWA** : Service Worker + manifest, installable sans App Store.

## Identité visuelle (à respecter dans toute UI)

Palette **aurore boréale** sur fond de nuit du Nord :

```
--nuit         #05070d   (fond, nuit du Nord)
--aurore-vert  #00e5a0   (vert aurore — accent principal)
--aurore-cyan  #2dd4e8   (cyan)
--aurore-viol  #7f77dd   (violet)
--aurore-rose  #c084fc   (rose-violet)
--texte        #e7f3ef   (texte clair)
```

Style : **glassmorphism** (surfaces en verre `backdrop-filter: blur`), esthétique **matrix/glitch** quand ça adonne (via TilexFX), dégradés d'aurore animés en arrière-plan. Toujours respecter `prefers-reduced-motion`.

## Carte des fichiers

```
ti-lex-v10/
├── CLAUDE.md                          ← t'es icitte
├── README.md                          guide de montage humain
├── index.html                         interface PWA (UI + glue)
├── tilex-comm.js                      MOTEUR : Realtime, présence, persistance, reconnexion
├── tilex-push-client.js               abonnement aux push notifs
├── sw.js                              Service Worker (offline + réception push)
├── config.example.js                  → copier vers config.js
├── manifest.json                      manifeste PWA
├── package.json                       scripts de dev
├── icons/                             icônes aurore (192, 512, maskable, badge)
├── tilex-schema.sql                   schéma Postgres + RLS
└── supabase/functions/tilex-push/
    └── index.ts                       Edge Function (envoi des push)
```

## Le moteur en bref (`tilex-comm.js`)

Classe `TilexComm` (émetteur d'événements). Le client Supabase est **injecté** (`opts.supabase`).

```js
const comm = new TilexComm({ supabase, room: 'ti-lex-al-global', user: { id, nom } });
comm.on('chat', (msg) => { /* ... */ });
comm.on('presence', (devices) => { /* qui est en ligne */ });
await comm.connect();
await comm.loadHistory(40);
comm.sendChat('allo');
comm.sendToAgent('salut AL');   // canal Agent AL déjà prêt
```

Types de messages : `chat`, `sync` (synchro entre appareils d'un même usager), `agent` (Agent AL), `signal` (typing/lu), `ping` (keepalive). Les `ping`/`signal` ne sont **pas** persistés.

## Sécurité (important — focus hardening)

- **RLS activé** sur les 3 tables (`tilex_messages`, `tilex_devices`, `tilex_push_subs`).
- Écriture limitée au propriétaire : `auth.uid() = auth_uid`. Impossible d'écrire au nom d'un autre.
- La clé `service_role` reste **seulement** dans l'Edge Function `tilex-push`. Jamais côté client.
- La clé `anon` est publique (correct, protégée par RLS) — elle va dans `config.js` (gitignoré).
- Toute nouvelle table doit avoir RLS activé **dès sa création**, avec politiques propriétaire.

## Démarrage rapide

```bash
# 1. La base de données — roule tilex-schema.sql dans le SQL Editor du projet rnuripmfozlxenryxhdc

# 2. La config locale
cp config.example.js config.js     # pis mets ta clé anon dedans

# 3. Serveur de dev
npm run dev                        # http://localhost:5173

# 4. Les push (optionnel)
npm run vapid                      # génère les clés VAPID
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contact@ti-lex.app --project-ref rnuripmfozlxenryxhdc
npm run deploy:push
```

## État actuel pis prochaines étapes

**Fait :**
- ✅ Moteur de communication temps réel (broadcast + présence + persistance + reconnexion)
- ✅ Interface PWA aurore boréale / glassmorphism
- ✅ Schéma SQL avec RLS sécurisé
- ✅ Push notifications (client + Edge Function)

**À faire (par ordre de priorité) :**
1. **Brancher Supabase Auth** dans l'interface (goal actif). Présentement le `user.id` vient juste du nom saisi — faut le remplacer par le vrai `auth.uid()` pour que les politiques RLS d'écriture fonctionnent. Voir l'écran de connexion dans `index.html`.
2. **Connecter Agent AL** sur le canal `agent` (déjà prêt dans le moteur). Brancher `comm.sendToAgent()` sur l'Edge Function de l'agent.
3. Câbler `tilex-push-client.js` dans `index.html` (demander la permission push après connexion).
4. Brancher la synchro d'état (`comm.syncState()`) entre les appareils d'un même usager.

## Conventions

- Commentaires de code en français.
- Noms de variables/fonctions en français quand c'est du domaine ti-lex (`afficher`, `envoyer`, `appareils`), anglais OK pour les termes techniques standards.
- Sentence case dans l'UI, pas de Title Case.
- Toujours tester que ça reste fonctionnel hors ligne (PWA) pis sur mobile.

---

🌌 *ti-lex v10 — l'aurore boréale dans ton code. Produit du Québec.*
