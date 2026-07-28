-- ti-lex v10 — increment_ai_usage : exempter l'administrateur de la limite
-- ============================================================================
-- Problème corrigé
-- ----------------
-- check-abonnement accorde un accès illimité à l'administrateur (bypass admin),
-- mais le quota quotidien était appliqué séparément par cette RPC, appelée par
-- ai-proxy pour TOUT utilisateur authentifié. Passé p_limit (200 chats/jour),
-- la RPC renvoyait allowed=false, ai-proxy répondait 429, et l'agent du
-- proprio se retrouvait bloqué sur son propre projet malgré le bypass.
--
-- Correctif : l'admin (public.user_roles.role = 'admin', même définition que
-- public.is_admin()) voit son usage TOUJOURS COMPTÉ — les statistiques restent
-- exactes — mais la limite ne lui est jamais appliquée.
--
-- Le comportement des utilisateurs normaux est INCHANGÉ : la limite reste
-- appliquée par le WHERE conditionnel sur ON CONFLICT, qui garde son atomicité
-- (vérifie ET incrémente en une seule requête, pas de course possible).
-- ============================================================================

create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_kind    text,
  p_limit   integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new   integer;
  v_admin boolean;
begin
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'admin'
  ) into v_admin;

  -- 👑 Admin : on compte l'usage, sans jamais refuser (pas de WHERE limitant).
  if v_admin then
    if p_kind = 'image' then
      insert into public.ai_usage as u (user_id, day, image_count)
      values (p_user_id, current_date, 1)
      on conflict (user_id, day) do update
        set image_count = u.image_count + 1
      returning u.image_count into v_new;
    else
      insert into public.ai_usage as u (user_id, day, chat_count)
      values (p_user_id, current_date, 1)
      on conflict (user_id, day) do update
        set chat_count = u.chat_count + 1
      returning u.chat_count into v_new;
    end if;
    return jsonb_build_object('allowed', true, 'count', coalesce(v_new, 1), 'admin', true);
  end if;

  -- Utilisateurs normaux : comportement d'origine, limite appliquée.
  if p_kind = 'image' then
    insert into public.ai_usage as u (user_id, day, image_count)
    values (p_user_id, current_date, 1)
    on conflict (user_id, day) do update
      set image_count = u.image_count + 1
      where u.image_count < p_limit
    returning u.image_count into v_new;
  else
    insert into public.ai_usage as u (user_id, day, chat_count)
    values (p_user_id, current_date, 1)
    on conflict (user_id, day) do update
      set chat_count = u.chat_count + 1
      where u.chat_count < p_limit
    returning u.chat_count into v_new;
  end if;

  if v_new is null then
    return jsonb_build_object('allowed', false);
  end if;
  return jsonb_build_object('allowed', true, 'count', v_new);
end;
$$;

-- La RPC n'est appelable que par le service role (ai-proxy) — on ré-affirme les
-- révocations de 0056 : « create or replace » ne les touche pas, mais les
-- default privileges de Supabase peuvent exposer une nouvelle fonction à anon.
revoke all on function public.increment_ai_usage(uuid, text, integer) from public;
revoke all on function public.increment_ai_usage(uuid, text, integer) from anon;
revoke all on function public.increment_ai_usage(uuid, text, integer) from authenticated;
