-- 0064_user_connections_barrer_token.sql
-- Barre github_access_token au navigateur.
--
-- Le problème : la RLS de user_connections laisse l'usager lire SA ligne — ce
-- qui incluait le PAT GitHub en clair. N'importe quel XSS dans une page, ou
-- juste la console du navigateur avec la clé anon, pouvait le sortir.
--
-- ⚠️ Piège Postgres : un « revoke select (colonne) » fait RIEN tant que le
--    GRANT au niveau TABLE existe — le privilège de table couvre toutes les
--    colonnes. Faut enlever le grant de table, PIS redonner colonne par
--    colonne. C'est ce que le bloc ci-dessous fait (généré depuis le
--    catalogue pour pas se tromper dans une liste de 17 noms).
--
-- Aucun code client lit ni écrit github_access_token : ça passe toujours par
-- les edge functions validate-github / github-proxy, qui roulent en
-- service_role — donc pas touchées par ce revoke.
--
-- ⚠️ Deux conséquences à retenir :
--    1. « select * » sur user_connections plante maintenant côté client.
--       pro.html:chargerConnexions() liste ses colonnes (même commit). Toute
--       nouvelle requête doit faire pareil.
--    2. Une colonne ajoutée plus tard n'aura PAS le grant tant que ce bloc
--       est pas rejoué. C'est fail-closed, c'est voulu.
--
-- supabase_anon_key reste lisible EXPRÈS : une clé anon est publique par
-- design (protégée par la RLS du projet visé), pis pro.html s'en sert côté
-- client pour parler au projet Supabase de l'usager.

do $$
declare colonnes text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into colonnes
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'user_connections'
    and column_name <> 'github_access_token';

  revoke select on public.user_connections from anon, authenticated;
  execute format(
    'grant select (%s) on public.user_connections to anon, authenticated',
    colonnes
  );
end $$;
