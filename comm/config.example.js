/* ============================================================================
 * config.example.js — Configuration ti-lex v10
 * ----------------------------------------------------------------------------
 * COPIE ce fichier vers `config.js` pis mets tes vraies valeurs.
 * `config.js` est dans le .gitignore — il sera jamais commité.
 *
 * La clé ANON est publique (protégée par RLS) — pas de stress à l'exposer.
 * Ne JAMAIS mettre la clé service_role ici — elle reste dans l'Edge Function.
 * ============================================================================ */

window.TILEX_CONFIG = {
  SUPABASE_URL: 'https://rnuripmfozlxenryxhdc.supabase.co',
  SUPABASE_ANON_KEY: 'TON_ANON_KEY_ICI',

  // Clé publique VAPID pour les push notifs (génépostre avec: npx web-push generate-vapid-keys)
  VAPID_PUBLIC_KEY: 'TA_VAPID_PUBLIC_KEY_ICI',

  // Salon par défaut
  ROOM: 'ti-lex-al-global',
};
