# Politique CORS — ti-lex Edge Functions

## Principe

Toutes les Edge Functions (sauf `stripe-webhook`) utilisent un module CORS partagé
qui reflète dynamiquement l'en-tête `Origin` de la requête **uniquement** si cette
origine figure dans la liste autorisée; les requêtes provenant d'origines inconnues
ne reçoivent aucun en-tête `Access-Control-Allow-Origin`, ce qui bloque l'accès
navigateur.

## Module partagé

`supabase/functions/_shared/cors.ts`

| Export | Description |
|---|---|
| `corsHeaders(req)` | Retourne un objet `Record<string, string>` avec les en-têtes CORS adaptés à la requête. |
| `handlePreflight(req)` | Retourne une `Response("ok")` si la méthode est `OPTIONS`, sinon `null`. |

## Origines autorisées

| Origine | Raison |
|---|---|
| `https://ti-lex-v10.vercel.app` | Production |
| `https://ceauprevost812-3889s-projects.vercel.app` | Production (alias) |
| `http://localhost:5173` | Développement local (Vite) |
| `http://localhost:3000` | Développement local (alt) |
| `*.vercel.app` | Previews Vercel (activable via `ALLOW_VERCEL_PREVIEWS`) |

## Ajouter une origine

1. Ouvrir `supabase/functions/_shared/cors.ts`
2. Ajouter l'URL dans le tableau `ALLOWED_ORIGINS`
3. Redéployer les Edge Functions concernées

## En-têtes retournés

```
Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-anthropic-key
Access-Control-Max-Age: 86400
Vary: Origin
```

## Fonctions exclues

| Fonction | Raison |
|---|---|
| `stripe-webhook` | Authentification par signature Stripe, pas d'appel navigateur |

## Usage dans une Edge Function

```ts
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  // ... logique métier ...

  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
```
