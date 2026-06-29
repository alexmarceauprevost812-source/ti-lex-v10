// ============================================================================
// tilex-push — Edge Function Supabase (Deno)
// ----------------------------------------------------------------------------
// Envoie une notification push web aux appareils abonnés d'un usager.
// Appelée quand un message arrive pour quelqu'un qui n'est pas en ligne.
//
// Déploiement :
//   supabase functions deploy tilex-push --project-ref rnuripmfozlxenryxhdc
//
// Secrets requis (clés VAPID) :
//   supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:contact@ti-lex.app
//
// 🍁 Produit du Québec
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Charge {
  destinataire_uid: string;   // auth.uid de la personne à rejoindre
  titre?: string;
  corps: string;
  url?: string;
}

Deno.serve(async (req: Request) => {
  // Préflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // --- Config VAPID ---
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@ti-lex.app',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    // --- Client Supabase avec la clé service (lecture des abonnements) ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const charge: Charge = await req.json();
    if (!charge.destinataire_uid || !charge.corps) {
      return json({ erreur: 'destinataire_uid et corps sont requis' }, 400);
    }

    // --- Va chercher tous les abonnements push du destinataire ---
    const { data: subs, error } = await supabase
      .from('tilex_push_subs')
      .select('endpoint, p256dh, auth_key')
      .eq('auth_uid', charge.destinataire_uid);

    if (error) return json({ erreur: error.message }, 500);
    if (!subs || subs.length === 0) {
      return json({ ok: true, envoyes: 0, note: 'aucun appareil abonné' }, 200);
    }

    const payload = JSON.stringify({
      titre: charge.titre ?? 'ti-lex',
      corps: charge.corps,
      url: charge.url ?? './',
      tag: 'ti-lex-msg',
    });

    // --- Envoie à chaque appareil ---
    let envoyes = 0;
    const morts: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      const abonnement = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      };
      try {
        await webpush.sendNotification(abonnement, payload);
        envoyes += 1;
      } catch (err: any) {
        // 404 / 410 = abonnement expiré → on le marque pour nettoyage
        if (err.statusCode === 404 || err.statusCode === 410) {
          morts.push(sub.endpoint);
        } else {
          console.error('[tilex-push] échec envoi', err.statusCode, err.body);
        }
      }
    }));

    // --- Nettoie les abonnements morts ---
    if (morts.length > 0) {
      await supabase.from('tilex_push_subs').delete().in('endpoint', morts);
    }

    return json({ ok: true, envoyes, nettoyes: morts.length }, 200);

  } catch (err: any) {
    console.error('[tilex-push] erreur', err);
    return json({ erreur: err.message ?? 'erreur interne' }, 500);
  }
});

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
