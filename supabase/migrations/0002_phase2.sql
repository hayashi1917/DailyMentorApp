-- ============================================================
-- Daily Mentor Agent - phase 2
--  * Google Calendar connection (encrypted tokens)
--  * Web Push subscriptions
--  * pgvector long-term memory search
--  * task breakdown (parent/child tasks)
-- ============================================================

-- ------------------------------------------------------------
-- google_calendar_connections
-- tokens are AES-256-GCM encrypted server-side before insert,
-- so RLS-readable rows never expose usable credentials.
-- ------------------------------------------------------------
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  google_email text,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- push_subscriptions
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- ------------------------------------------------------------
-- pgvector: embedding column on user_memories
-- ------------------------------------------------------------
create extension if not exists vector;

alter table public.user_memories
  add column if not exists embedding vector(1536);

create index if not exists user_memories_embedding_idx
  on public.user_memories
  using hnsw (embedding vector_cosine_ops);

-- Similarity search over the caller's own memories.
-- security invoker: RLS applies, and we filter by auth.uid() as well.
create or replace function public.match_user_memories(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  memory_type text,
  content text,
  confidence numeric,
  similarity double precision
)
language sql
stable
as $$
  select
    m.id,
    m.memory_type,
    m.content,
    m.confidence,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.user_memories m
  where m.user_id = auth.uid()
    and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

-- ------------------------------------------------------------
-- task breakdown: child tasks
-- ------------------------------------------------------------
alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;

create index if not exists tasks_parent_task_id_idx
  on public.tasks (parent_task_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.google_calendar_connections enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'google_calendar_connections',
    'push_subscriptions'
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
