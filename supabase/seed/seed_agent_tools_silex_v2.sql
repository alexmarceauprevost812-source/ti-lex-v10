-- ============================================================================
-- seed_agent_tools_silex_v2.sql — Enregistrement des 5 outils SILEX v2
-- (à exécuter via execute_sql, APRÈS la migration 0060 et le déploiement de
-- l'Edge Function silex-scan-v2 + agent-chat-stream patché)
--
-- Chaque outil est un custom_function avec config.endpoint='silex-scan-v2' :
-- l'exécuteur générique d'agent-chat-stream fait le POST en relayant le JWT
-- de l'utilisateur. Aucune modification de code requise par la suite pour
-- ajouter d'autres pouvoirs du même type.
-- ============================================================================

-- Idempotence : on retire d'abord d'éventuelles versions antérieures.
delete from public.agent_tools
where (agent_id, name) in (
  ('dc2610b5-646a-40cd-81f7-3d79616b7732', 'scan_complet_v2'),
  ('dc2610b5-646a-40cd-81f7-3d79616b7732', 'score_securite_rapide'),
  ('dc2610b5-646a-40cd-81f7-3d79616b7732', 'comparer_scans'),
  ('dc2610b5-646a-40cd-81f7-3d79616b7732', 'lire_rapport_securite'),
  ('3d392608-6885-46f0-893f-f0a74acd778c', 'verifier_lien_securise')
);

-- ─── ti-lex-al (agent maître SILEX) ─────────────────────────────────────────
insert into public.agent_tools (agent_id, user_id, tool_type, name, description, config, is_enabled, sort_order) values

-- 1) Scan complet (tous les modules passifs)
(
  'dc2610b5-646a-40cd-81f7-3d79616b7732',
  'd9a1985a-e106-4ea5-9ada-cac775c0b820',
  'custom_function',
  'scan_complet_v2',
  'Scan SILEX v2 complet : DNS avancé (DKIM/CAA/DNSSEC), certificat TLS, sous-domaines, fichiers exposés, headers, CORS, fingerprint, score 0-100 et rapport. Défensif, cible autorisée requise.',
  jsonb_build_object(
    'endpoint', 'silex-scan-v2',
    'default_params', jsonb_build_object('action', 'scan_complet'),
    'input_schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target', jsonb_build_object('type', 'string', 'description', 'Domaine ou IPv4 publique à scanner (ex. exemple.com). Une autorisation active (SOW ou cible vérifiée) est requise.')
      ),
      'required', jsonb_build_array('target')
    )
  ),
  true,
  20
),

-- 2) Score de sécurité rapide (DNS + headers + TLS)
(
  'dc2610b5-646a-40cd-81f7-3d79616b7732',
  'd9a1985a-e106-4ea5-9ada-cac775c0b820',
  'custom_function',
  'score_securite_rapide',
  'Score de sécurité rapide SILEX v2 : DNS (SPF/DMARC/DKIM), headers HTTP et certificat TLS, avec score 0-100 et grade A-F. Défensif, cible autorisée requise.',
  jsonb_build_object(
    'endpoint', 'silex-scan-v2',
    'default_params', jsonb_build_object('action', 'scan_rapide'),
    'input_schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target', jsonb_build_object('type', 'string', 'description', 'Domaine ou IPv4 publique à évaluer (ex. exemple.com).')
      ),
      'required', jsonb_build_array('target')
    )
  ),
  true,
  21
),

-- 3) Comparaison des 2 derniers scans d'une cible
(
  'dc2610b5-646a-40cd-81f7-3d79616b7732',
  'd9a1985a-e106-4ea5-9ada-cac775c0b820',
  'custom_function',
  'comparer_scans',
  'Compare les 2 derniers scans d''une cible (nouveaux findings, résolus, verdict amélioré/dégradé).',
  jsonb_build_object(
    'endpoint', 'silex-scan-v2',
    'default_params', jsonb_build_object('action', 'comparer'),
    'input_schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target', jsonb_build_object('type', 'string', 'description', 'Cible dont on compare les 2 derniers rapports (ex. exemple.com).')
      ),
      'required', jsonb_build_array('target')
    )
  ),
  true,
  22
),

-- 4) Lecture du dernier rapport (target optionnel)
(
  'dc2610b5-646a-40cd-81f7-3d79616b7732',
  'd9a1985a-e106-4ea5-9ada-cac775c0b820',
  'custom_function',
  'lire_rapport_securite',
  'Lit le dernier rapport SILEX v2 (score, grade, findings, diff, résumé).',
  jsonb_build_object(
    'endpoint', 'silex-scan-v2',
    'default_params', jsonb_build_object('action', 'lire_rapport'),
    'input_schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target', jsonb_build_object('type', 'string', 'description', 'Optionnel : cible précise (ex. exemple.com). Si omis, retourne le rapport le plus récent toutes cibles confondues.')
      )
    )
  ),
  true,
  23
);

-- ─── Marceau (agent grand public) : vérification rapide d'un lien ───────────
insert into public.agent_tools (agent_id, user_id, tool_type, name, description, config, is_enabled, sort_order) values (
  '3d392608-6885-46f0-893f-f0a74acd778c',
  'd9a1985a-e106-4ea5-9ada-cac775c0b820',
  'custom_function',
  'verifier_lien_securise',
  'Vérifie rapidement si un site est sécuritaire (HTTPS, headers, certificat, DNS) — usage défensif.',
  jsonb_build_object(
    'endpoint', 'silex-scan-v2',
    'default_params', jsonb_build_object('action', 'scan_rapide'),
    'input_schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target', jsonb_build_object('type', 'string', 'description', 'Site à vérifier : domaine ou URL (ex. exemple.com).')
      ),
      'required', jsonb_build_array('target')
    )
  ),
  true,
  20
);
