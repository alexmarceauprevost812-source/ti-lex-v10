-- 0004_plan_limits_update.sql
-- Mise à jour des limites des 3 forfaits ti-lex-AL

-- ✅ FORFAIT STARTER — $28 CAD/mois
UPDATE plan_limits SET
  messages_per_day              = 40,
  messages_per_month            = 1200,
  agents_max                    = 3,
  thinking_enabled              = true,
  max_thinking_tokens_per_message = 3000,
  allowed_models                = ARRAY['claude-haiku-4-5','claude-sonnet-4-6'],
  codex_sessions_per_day        = 3,
  codex_sessions_per_month      = 20,
  codex_commits_per_day         = 5,
  description                   = 'Forfait Starter — bien démarrer avec ti-lex'
WHERE plan = 'starter';

-- ✅ FORFAIT PRO — $78 CAD/mois
UPDATE plan_limits SET
  messages_per_day              = 120,
  messages_per_month            = 3600,
  agents_max                    = 10,
  thinking_enabled              = true,
  max_thinking_tokens_per_message = 6000,
  allowed_models                = ARRAY['claude-haiku-4-5','claude-sonnet-4-6'],
  codex_projects_max            = 5,
  codex_sessions_per_day        = 10,
  codex_sessions_per_month      = 60,
  codex_commits_per_day         = 20,
  description                   = 'Forfait Pro — créateurs sérieux, marges saines'
WHERE plan = 'pro';

-- ✅ FORFAIT INDUSTRIEL — $140 CAD/mois
UPDATE plan_limits SET
  messages_per_day              = 200,
  messages_per_month            = 6000,
  agents_max                    = 30,
  thinking_enabled              = true,
  max_thinking_tokens_per_message = 10000,
  allowed_models                = ARRAY['claude-haiku-4-5','claude-sonnet-4-6','claude-opus-4-6'],
  codex_projects_max            = 20,
  codex_sessions_per_day        = 30,
  codex_sessions_per_month      = 200,
  codex_commits_per_day         = 100,
  description                   = 'Forfait Industriel — puissance totale, Opus inclus'
WHERE plan = 'industriel';
