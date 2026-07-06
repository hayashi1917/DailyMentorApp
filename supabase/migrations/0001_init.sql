-- ============================================================
-- Daily Mentor Agent - initial schema
-- Apply with: supabase db push  (or paste into SQL Editor)
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  timezone text default 'Asia/Tokyo',
  created_at timestamptz default now()
);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- tasks
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  deadline timestamptz,
  estimated_minutes integer,
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  difficulty text check (difficulty in ('low', 'medium', 'high')) default 'medium',
  status text check (status in ('todo', 'done', 'archived')) default 'todo',
  next_action text,
  recovery_action text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_user_id_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_id_deadline_idx on public.tasks (user_id, deadline);

-- ------------------------------------------------------------
-- daily_checkins
-- ------------------------------------------------------------
create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  energy_level integer,
  mood text check (mood in ('good', 'normal', 'bad')),
  focus_area text,
  plan_type text check (plan_type in ('attack', 'maintain', 'recovery')),
  created_at timestamptz default now(),
  unique (user_id, date)
);

-- ------------------------------------------------------------
-- daily_plans
-- ------------------------------------------------------------
create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  policy text,
  minimum_plan_json jsonb,
  standard_plan_json jsonb,
  stretch_plan_json jsonb,
  if_then_plan_json jsonb,
  mentor_message text,
  is_recovery_mode boolean default false,
  created_at timestamptz default now(),
  unique (user_id, date)
);

-- ------------------------------------------------------------
-- daily_reviews
-- ------------------------------------------------------------
create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  minimum_completed text check (minimum_completed in ('completed', 'partial', 'not_completed')),
  completion_score integer,
  failure_reasons text[],
  reflection_text text,
  created_at timestamptz default now(),
  unique (user_id, date)
);

-- ------------------------------------------------------------
-- feedback_events
-- ------------------------------------------------------------
create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text check (target_type in ('daily_plan', 'mentor_message', 'task_breakdown', 'recovery_plan', 'other')),
  target_id uuid,
  feedback_type text check (feedback_type in ('helpful', 'not_helpful', 'too_heavy', 'too_light', 'good_timing', 'bad_timing', 'wrong_priority', 'tone_too_strict', 'tone_too_soft', 'too_long', 'other')),
  feedback_text text,
  created_at timestamptz default now()
);

create index if not exists feedback_events_user_id_created_at_idx on public.feedback_events (user_id, created_at desc);

-- ------------------------------------------------------------
-- user_memories
-- ------------------------------------------------------------
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text check (memory_type in ('rhythm', 'preference', 'failure_pattern', 'success_pattern', 'task_style', 'mentor_tone', 'recovery_strategy')),
  content text not null,
  confidence numeric default 0.5,
  evidence_count integer default 1,
  last_observed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_memories_user_id_idx on public.user_memories (user_id);

-- ------------------------------------------------------------
-- lifestyle_patterns
-- ------------------------------------------------------------
create table if not exists public.lifestyle_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_key text,
  value numeric,
  sample_size integer default 0,
  updated_at timestamptz default now(),
  unique (user_id, pattern_key)
);

-- ------------------------------------------------------------
-- agent_skills
-- ------------------------------------------------------------
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_name text check (skill_name in ('planning_skill', 'recovery_skill', 'task_breakdown_skill', 'mentor_tone_skill', 'review_skill')),
  rule_text text not null,
  is_active boolean default true,
  version integer default 1,
  created_from text check (created_from in ('default', 'feedback', 'behavior_log', 'manual')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agent_skills_user_id_active_idx on public.agent_skills (user_id, is_active);

-- ============================================================
-- Row Level Security
-- Policy: users can only touch their own rows.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.feedback_events enable row level security;
alter table public.user_memories enable row level security;
alter table public.lifestyle_patterns enable row level security;
alter table public.agent_skills enable row level security;

-- profiles: keyed on id
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (id = auth.uid());

-- All other tables: keyed on user_id
do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks',
    'daily_checkins',
    'daily_plans',
    'daily_reviews',
    'feedback_events',
    'user_memories',
    'lifestyle_patterns',
    'agent_skills'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select using (user_id = auth.uid())', t);

    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert with check (user_id = auth.uid())', t);

    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);

    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete using (user_id = auth.uid())', t);
  end loop;
end;
$$;
