-- ============================================================
-- Daily Mentor Agent - phase 4
--  * persistent mentor conversations (AI-centric planning)
--    - chat history survives reloads and feeds future plan
--      generation as context
--    - actions_json records what the agent actually did in a
--      turn (tasks created, plan updated, memory saved)
-- ============================================================

create table if not exists public.mentor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  actions_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mentor_messages_user_id_created_at_idx
  on public.mentor_messages (user_id, created_at desc);

alter table public.mentor_messages enable row level security;

drop policy if exists "mentor_messages_select_own" on public.mentor_messages;
create policy "mentor_messages_select_own" on public.mentor_messages
  for select using (user_id = auth.uid());
drop policy if exists "mentor_messages_insert_own" on public.mentor_messages;
create policy "mentor_messages_insert_own" on public.mentor_messages
  for insert with check (user_id = auth.uid());
drop policy if exists "mentor_messages_update_own" on public.mentor_messages;
create policy "mentor_messages_update_own" on public.mentor_messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "mentor_messages_delete_own" on public.mentor_messages;
create policy "mentor_messages_delete_own" on public.mentor_messages
  for delete using (user_id = auth.uid());
