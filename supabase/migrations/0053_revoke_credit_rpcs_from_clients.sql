-- 0053 : Verrouille les RPC de crédits (anti credit-minting). [Sécurité — revue Codex P1]
-- grant_credits / consume_credits sont SECURITY DEFINER et appelées UNIQUEMENT
-- côté serveur (service_role, qui bypasse ces grants). On retire EXECUTE aux
-- rôles client (anon, authenticated, PUBLIC) pour qu'un utilisateur ne puisse
-- pas s'auto-créditer (grant_credits) ni se créditer via un montant négatif
-- (consume_credits). Aucun appel client à ces fonctions dans le code.
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
