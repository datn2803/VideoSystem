-- VideoSystem initial schema (D1)
-- Section 4.3 of PRD.md

create extension if not exists "pgcrypto";

-- ─────────────── INTEGRATION HUB ───────────────
do $$ begin
  create type provider_kind as enum ('llm','tts','avatar','render','publish','storage');
exception when duplicate_object then null; end $$;

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  kind provider_kind not null,
  name text not null,
  is_default boolean default false,
  config jsonb default '{}'::jsonb,
  enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists provider_credentials (
  provider_id uuid primary key references providers(id) on delete cascade,
  secret_ciphertext bytea not null,
  rotated_at timestamptz default now(),
  expires_at timestamptz
);

create table if not exists provider_usage (
  id bigserial primary key,
  provider_id uuid references providers(id) on delete cascade,
  date date not null,
  units_used numeric default 0,
  cost_estimate_usd numeric default 0,
  unique(provider_id, date)
);

create table if not exists provider_health (
  id bigserial primary key,
  provider_id uuid references providers(id) on delete cascade,
  checked_at timestamptz default now(),
  ok boolean,
  latency_ms int,
  error text
);

-- ─────────────── CONTENT DOMAIN ───────────────
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  industry text default 'personal_banking',
  role text,
  expertise jsonb,
  audience jsonb,
  tone jsonb,
  usp text,
  voice_sample_url text,
  created_at timestamptz default now()
);

do $$ begin
  create type footage_tag as enum ('intro','talking','broll','cta','outro','other');
exception when duplicate_object then null; end $$;

create table if not exists footage_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  duration_sec numeric,
  tag footage_tag not null,
  notes text,
  uploaded_at timestamptz default now()
);

do $$ begin
  create type project_status as enum ('planning','scripting','rendering','review','approved','exported','rejected');
exception when duplicate_object then null; end $$;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  topic text not null,
  brief text,
  status project_status default 'planning',
  scheduled_for date,
  created_at timestamptz default now()
);

create table if not exists content_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  period_start date,
  period_end date,
  topics jsonb,
  generated_by_model text,
  created_at timestamptz default now()
);

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  hook text,
  body text,
  cta text,
  caption text,
  hashtags text[],
  variant_prompts jsonb,
  audit_status text default 'pending',
  audit_notes jsonb,
  generated_by_model text,
  version int default 1,
  created_at timestamptz default now()
);

create table if not exists audio_assets (
  id uuid primary key default gen_random_uuid(),
  script_id uuid references scripts(id) on delete cascade,
  storage_path text not null,
  duration_ms int,
  voice_id text,
  cost_usd numeric,
  created_at timestamptz default now()
);

do $$ begin
  create type concept_kind as enum ('talking','broll','animation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type render_status as enum ('queued','rendering','done','failed');
exception when duplicate_object then null; end $$;

create table if not exists video_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  script_id uuid references scripts(id) on delete set null,
  audio_id uuid references audio_assets(id) on delete set null,
  concept concept_kind not null,
  render_provider text,
  render_job_id text,
  render_status render_status default 'queued',
  output_url text,
  duration_sec numeric,
  cost_usd numeric,
  error text,
  created_at timestamptz default now()
);

do $$ begin
  create type approval_state as enum ('pending','approved','rejected','revision_requested');
exception when duplicate_object then null; end $$;

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  video_draft_id uuid references video_drafts(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  state approval_state default 'pending',
  comment text,
  created_at timestamptz default now()
);

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  video_draft_id uuid references video_drafts(id) on delete cascade,
  platform text,
  caption_localized text,
  hashtags_localized text[],
  exported_at timestamptz default now()
);

-- ─────────────── INDEXES ───────────────
create index if not exists idx_footage_profile on footage_assets(profile_id, tag);
create index if not exists idx_projects_status on projects(profile_id, status);
create index if not exists idx_drafts_project on video_drafts(project_id, concept);
create index if not exists idx_usage_date on provider_usage(date);

-- ─────────────── RLS ───────────────
alter table profiles enable row level security;
alter table footage_assets enable row level security;
alter table projects enable row level security;
alter table content_plans enable row level security;
alter table scripts enable row level security;
alter table audio_assets enable row level security;
alter table video_drafts enable row level security;
alter table approvals enable row level security;
alter table exports enable row level security;

-- Owner-only policies
create policy "profiles_owner" on profiles for all using (owner_id = auth.uid());
create policy "footage_owner" on footage_assets for all using (
  exists (select 1 from profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
create policy "projects_owner" on projects for all using (
  exists (select 1 from profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
create policy "plans_owner" on content_plans for all using (
  exists (select 1 from profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
create policy "scripts_owner" on scripts for all using (
  exists (select 1 from projects pr join profiles p on p.id = pr.profile_id where pr.id = project_id and p.owner_id = auth.uid())
);
create policy "audio_owner" on audio_assets for all using (
  exists (select 1 from scripts s join projects pr on pr.id = s.project_id join profiles p on p.id = pr.profile_id where s.id = script_id and p.owner_id = auth.uid())
);
create policy "drafts_owner" on video_drafts for all using (
  exists (select 1 from projects pr join profiles p on p.id = pr.profile_id where pr.id = project_id and p.owner_id = auth.uid())
);
create policy "approvals_owner" on approvals for all using (
  exists (select 1 from video_drafts v join projects pr on pr.id = v.project_id join profiles p on p.id = pr.profile_id where v.id = video_draft_id and p.owner_id = auth.uid())
);
create policy "exports_owner" on exports for all using (
  exists (select 1 from video_drafts v join projects pr on pr.id = v.project_id join profiles p on p.id = pr.profile_id where v.id = video_draft_id and p.owner_id = auth.uid())
);
