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
    // --- Client Supabase avec la clé service (lecture des abonnements + secrets) ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Authentification de l'appelant : OBLIGATOIRE. On ne pousse QUE vers
    //     les appareils de l'appelant lui-même (modèle privé par usager). Sans ça,
    //     n'importe quel usager pourrait spammer les appareils d'un autre en
    //     fournissant son auth_uid (exposé par le Realtime). ---
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ erreur: 'authentification requise' }, 401);
    const { data: { user: appelant }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !appelant) return json({ erreur: 'jeton invalide' }, 401);

    // --- Config VAPID : lues depuis le coffre tilex_secrets (RLS verrouillée,
    //     service_role seulement), avec repli sur les variables d'environnement. ---
    const { data: vapid } = await supabase
      .from('tilex_secrets')
      .select('public_key, private_key, subject')
      .eq('nom', 'vapid')
      .maybeSingle();

    const vapidPublic  = vapid?.public_key  ?? Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = vapid?.private_key ?? Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = vapid?.subject     ?? Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@ti-lex.app';

    if (!vapidPublic || !vapidPrivate) {
      return json({ erreur: 'clés VAPID introuvables (coffre tilex_secrets vide)' }, 500);
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const charge: Charge = await req.json();
    if (!charge.corps) {
      return json({ erreur: 'corps est requis' }, 400);
    }
    // La cible est TOUJOURS l'appelant lui-même : on ignore tout destinataire_uid
    // fourni (ou on refuse s'il vise quelqu'un d'autre). Impossible de pousser
    // vers les appareils d'un autre usager.
    if (charge.destinataire_uid && charge.destinataire_uid !== appelant.id) {
      return json({ erreur: 'interdit : on ne peut notifier que ses propres appareils' }, 403);
    }
    const cibleUid = appelant.id;

    // --- Va chercher tous les abonnements push de l'appelant ---
    const { data: subs, error } = await supabase
      .from('tilex_push_subs')
      .select('endpoint, p256dh, auth_key')
      .eq('auth_uid', cibleUid);

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
