-- 0054_usage_cache_tokens.sql — ti-lex v10
-- Suivi du prompt caching Anthropic dans les compteurs d'usage.
-- cache_creation_input_tokens : tokens écrits en cache (facturés 1,25x, une fois)
-- cache_read_input_tokens     : tokens lus du cache (facturés 0,1x → 90% d'économie)
-- Colonnes additives, valeur par défaut 0 (aucun impact sur la logique de quotas existante).

ALTER TABLE public.usage_daily
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens bigint NOT NULL DEFAULT 0;

ALTER TABLE public.usage_monthly
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens bigint NOT NULL DEFAULT 0;
