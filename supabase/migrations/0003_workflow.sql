-- ============================================================
-- Daily Mentor Agent - phase 3
--  * timed schedule on daily plans
--  * real-time time tracking (time_entries)
-- ============================================================

-- 時刻つきスケジュール(例: [{"start":"09:00","end":"10:00","title":"移動"}])
alter table public.daily_plans
  add column if not exists schedule_json jsonb;

-- ------------------------------------------------------------
-- time_entries: リアルタイム計測
-- ended_at が null の行が「実行中」
-- ------------------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  label text not null,
  date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists time_entries_user_id_date_idx
  on public.time_entries (user_id, date);

alter table public.time_entries enable row level security;

drop policy if exists "time_entries_select_own" on public.time_entries;
create policy "time_entries_select_own" on public.time_entries
  for select using (user_id = auth.uid());
drop policy if exists "time_entries_insert_own" on public.time_entries;
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (user_id = auth.uid());
drop policy if exists "time_entries_update_own" on public.time_entries;
create policy "time_entries_update_own" on public.time_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "time_entries_delete_own" on public.time_entries;
create policy "time_entries_delete_own" on public.time_entries
  for delete using (user_id = auth.uid());
