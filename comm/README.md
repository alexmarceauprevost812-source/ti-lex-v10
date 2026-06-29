# ti-lex v10 — système de communication mobile ↔ ordinateur

Communication temps réel entre mobile pis ordinateur, bâtie sur **Supabase Realtime**, installable comme **PWA**, avec **notifications push**.
Vanilla JS zéro-dépendance dans l'esprit de TilexFX.

🍁 **Produit du Québec** · Saguenay–Lac-Saint-Jean

---

## Les fichiers (du plus gros au plus petit)

| Fichier | Rôle |
|---|---|
| `tilex-comm.js` | Moteur de communication temps réel (canaux, présence, persistance, reconnexion) |
| `index.html` | Interface PWA — aurore boréale, glassmorphism |
| `tilex-schema.sql` | Schéma Postgres + politiques RLS sécurisées |
| `sw.js` | Service Worker (PWA offline + réception des push) |
| `supabase/functions/tilex-push/index.ts` | Edge Function qui envoie les push notifs |
| `tilex-push-client.js` | Abonnement de l'appareil aux push notifs |
| `manifest.json` | Manifeste PWA (installation sur l'écran d'accueil) |

---

## Montage en 5 étapes

### 1. La base de données
Dans le SQL Editor de ton projet `rnuripmfozlxenryxhdc`, roule `tilex-schema.sql`.
Ça crée les 3 tables avec **RLS activé pis politiques propriétaire** dès le départ.

### 2. La config dans `index.html`
Remplace dans le bloc `<script type="module">` :
```js
const SUPABASE_ANON_KEY = 'TON_ANON_KEY_ICI';
```
La clé `anon` est **publique** — c'est correct, elle est protégée par RLS.

### 3. Les clés VAPID (pour les push)
Génère une paire de clés VAPID :
```bash
npx web-push generate-vapid-keys
```
Pis configure les secrets de l'Edge Function :
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:contact@ti-lex.app \
  --project-ref rnuripmfozlxenryxhdc
```

### 4. Déploie l'Edge Function
```bash
supabase functions deploy tilex-push --project-ref rnuripmfozlxenryxhdc
```

### 5. Les icônes
Mets tes icônes dans un dossier `icons/` :
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `badge-72.png`.

---

## Comment ça marche

```
Mobile  ──┐                              ┌── Ordinateur
          │   Supabase Realtime          │
          ├──►  broadcast + présence  ◄───┤
          │                              │
          └──► Postgres (RLS) ◄──────────┘
                    │
                    ▼
          Edge Function tilex-push
                    │
                    ▼
          Web Push → appareil hors ligne
```

- **En ligne** : les messages passent par le **broadcast Realtime** (instantané).
- **Persistance** : chaque message est sauvé dans `tilex_messages` (sauf les pings/signaux).
- **Hors ligne** : l'Edge Function `tilex-push` rejoint l'usager via une notification push.
- **Présence** : tu vois en direct quels appareils sont connectés (📱 mobile, 🖥️ ordinateur).

---

## Brancher Agent AL

Le moteur a déjà un canal `agent` prêt :
```js
comm.sendToAgent('Salut AL, qu'est-ce que tu fais?');
comm.on('agent', (msg) => console.log(msg.data.reponse));
```
Tu branches ça sur ton Edge Function Agent AL pis le tour est joué.

---

## Sécurité (vu ton focus hardening)

- ✅ RLS activé sur les 3 tables
- ✅ Écriture limitée au propriétaire (`auth.uid() = auth_uid`) — impossible d'écrire au nom d'un autre
- ✅ Les abonnements push sont privés par usager
- ✅ Le Service Worker laisse passer Supabase sans interférer
- ✅ La clé service role reste **seulement** dans l'Edge Function, jamais côté client

---

🌌 *ti-lex v10 — l'aurore boréale dans ton code.*
