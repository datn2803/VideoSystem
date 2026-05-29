-- VideoSystem KV store for JSON documents
-- Run this in Supabase SQL Editor

create table if not exists kv_store (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Allow service_role to do anything (default in Supabase)
-- For anon key access, you'd add RLS policies here. MVP uses service_role.
alter table kv_store enable row level security;

-- Allow service_role full access (this is the default and what we use)
-- No policies needed; service_role bypasses RLS

-- Optional: anon read-only (for client-side reads, not used in MVP)
-- create policy "anon_read" on kv_store for select using (true);
