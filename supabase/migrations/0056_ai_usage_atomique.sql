-- Compteur d'usage IA quotidien par utilisateur, décrémenté de façon ATOMIQUE
-- par ai-proxy. Remplace l'ancien bloc read-then-upsert (course concurrente) qui
-- pointait de toute façon sur une table `ai_usage` inexistante — donc muet.
create table if not exists public.ai_usage (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  day         date    not null default current_date,
  chat_count  integer not null default 0,
  image_count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
-- Aucune policy : seul le service role (qui bypasse la RLS) y touche via ai-proxy.

-- Incrément ATOMIQUE + plafond en une seule requête. Le WHERE de l'ON CONFLICT
-- ne met à jour QUE si le compteur courant est sous la limite : impossible de
-- dépasser le quota en envoyant des requêtes en parallèle. Retourne allowed=false
-- (aucune ligne renvoyée par le RETURNING) quand la limite est atteinte.
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
  v_new integer;
begin
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

revoke all on function public.increment_ai_usage(uuid, text, integer) from public;
revoke all on function public.increment_ai_usage(uuid, text, integer) from anon;
revoke all on function public.increment_ai_usage(uuid, text, integer) from authenticated;
