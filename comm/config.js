/* ============================================================================
 * config.js — Configuration ti-lex v10 (module communication)
 * ----------------------------------------------------------------------------
 * Mêmes clés que la plateforme (projet rnuripmfozlxenryxhdc).
 * La clé ANON est publique — elle est protégée par RLS (lecture/écriture
 * limitées au propriétaire authentifié). Jamais la clé service_role ici.
 * ============================================================================ */
window.TILEX_CONFIG = {
  SUPABASE_URL: 'https://rnuripmfozlxenryxhdc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA',

  // Clé publique VAPID pour les push notifs (la privée reste côté serveur, dans tilex_secrets)
  VAPID_PUBLIC_KEY: 'BOM7oUhhURyGKPVovivKL4EBGPyPbSjoONXL3TXiAPNN04WbmBYZMJHVWCp5r6ayK56Ilflf5EsoWWEtW1l6xm0',

  // Salon par défaut
  ROOM: 'ti-lex-al-global',
};
