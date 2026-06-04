create table if not exists public.ai_usage (
  user_id text not null,
  day date not null default current_date,
  chat_count int not null default 0,
  image_count int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy "own usage read" on public.ai_usage
  for select using (auth.uid()::text = user_id);
