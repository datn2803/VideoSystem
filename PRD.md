# PRD — Video Content Automation System for Personal Branding

> **Version**: 1.0
> **Date**: 2026-05-21
> **Owner**: Product
> **Target MVP**: 7 ngày
> **Primary persona (MVP)**: Personal Banker

---

## 1. Tổng quan sản phẩm

### 1.1 Mục tiêu
Xây dựng một dây chuyền sản xuất nội dung video tự động hóa, cho phép một cá nhân chuyên gia (ban đầu là Personal Banker) tạo và xuất bản nội dung video đa kênh từ một profile chuyên môn và một bộ raw footage quay sẵn.

### 1.2 Vấn đề giải quyết
- Cá nhân muốn xây kênh phải tốn rất nhiều thời gian: nghĩ ý tưởng, viết script, dựng video, đăng tải, đo lường.
- Quay video chuyên nghiệp tốn kém — không thể quay lại mỗi tuần.
- Một lần quay nhiều shot phải tái sử dụng được cho hàng chục video output.
- Nội dung ngành nhạy cảm (tài chính, y tế, luật) cần kiểm duyệt trước khi publish.

### 1.3 Giải pháp
Hệ thống pipeline **profile + raw footage → AI agents → 3 concept video draft → admin review → export/publish**, với mô hình bán tự động (semi-auto) cho MVP: AI sinh nháp, người duyệt từng bước.

### 1.4 Phạm vi (Scope)

**In-scope (MVP)**
- Quản lý profile chuyên gia.
- Upload và gắn tag raw footage thủ công.
- Sinh content calendar + script + audio + 3 concept video draft tự động.
- Audit compliance bằng AI cho ngành banking.
- Admin review UI (Kanban) duyệt/yêu cầu chỉnh sửa.
- Export MP4 + caption + hashtag, upload thủ công lên TikTok/FB/YT.
- Integration Hub quản lý tập trung kết nối API các nhà cung cấp ngoài.

**Out-of-scope (MVP, để phase sau)**
- Auto-publish API qua TikTok/Meta/YouTube.
- Custom HeyGen avatar training.
- Analytics dashboard feedback loop.
- CRM + seeding tools.
- Multi-tenant SaaS (mỗi workspace có credentials riêng).
- Auto-tag footage bằng vision AI.

### 1.5 Mục tiêu thành công (Success metrics)
- **MVP demo**: 1 profile Personal Banker → 1 chủ đề content → 3 video MP4 draft × 3 concept khác nhau, end-to-end < 30 phút.
- **Chất lượng**: 80% draft được admin approve mà không cần edit lại script.
- **Compliance**: 0 video vi phạm quy định quảng cáo tài chính NHNN lọt qua Auditor.
- **Hiệu năng**: Tổng thời gian render 3 concept < 15 phút/chủ đề.

---

## 2. Personas & Use cases

### 2.1 Personas
| Persona | Mô tả | Mục tiêu |
|---|---|---|
| **Content Owner (User)** | Personal Banker, có chuyên môn, muốn xây kênh cá nhân | Tạo content đều đặn không tốn thời gian dựng |
| **Admin / Reviewer** | Có thể chính là Content Owner hoặc team marketing | Duyệt content trước khi publish, đảm bảo brand & compliance |
| **System Operator** | Người setup hệ thống, quản lý API keys, providers | Theo dõi cost, uptime, swap provider khi cần |

### 2.2 Use case chính
**UC-01**: User upload profile + 10 raw footage → hệ thống sinh content calendar 1 tháng (12 chủ đề) → user chọn 1 chủ đề → 3 video draft xuất hiện sau 15 phút → user duyệt → export MP4 → upload TikTok thủ công.

**UC-02**: Admin xem hàng đợi draft Kanban → preview video → request revision với comment → hệ thống re-generate chỉ phần cần sửa (script/voice/render).

**UC-03**: System Operator nhận cảnh báo HeyGen quota 90% → vào Integration Hub xoay key dự phòng → hệ thống tiếp tục chạy không gián đoạn.

---

## 3. Workflow tổng

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT                                                           │
│  ┌────────────────┐  ┌──────────────────┐                      │
│  │ Profile         │  │ Raw Footage      │                      │
│  │ (chuyên môn,    │  │ (nhiều shot,     │                      │
│  │  tone, USP)     │  │  user tự tag)    │                      │
│  └────────┬────────┘  └────────┬─────────┘                      │
└───────────┼─────────────────────┼────────────────────────────────┘
            │                     │
            ▼                     │
┌─────────────────────────────────┼────────────────────────────────┐
│  AGENT PIPELINE                 │                                │
│                                 │                                │
│  [Planner Agent]  ──► Content Calendar (N chủ đề)               │
│        │                                                         │
│        ▼                                                         │
│  [Scripter Agent] ──► Script (hook/body/CTA) + 3 variant prompt │
│        │                                                         │
│        ▼                                                         │
│  [Auditor Agent]  ──► Compliance check (banking regulations)    │
│        │ (pass)                                                  │
│        ▼                                                         │
│  [Voicer Agent]   ──► TTS audio (ElevenLabs)                    │
│        │                                                         │
│        ▼                                                         │
│  [Renderer Pipeline] ─┬──► Concept 1: Talking Head (HeyGen +    │
│                       │     footage tagged "talk")               │
│                       ├──► Concept 2: B-roll Storytelling        │
│                       │     (Creatomate + tagged "broll")        │
│                       └──► Concept 3: Animation (Creatomate     │
│                             motion graphics + data viz)          │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  REVIEW & PUBLISH                                                │
│                                                                  │
│  Admin Review UI (Kanban)                                       │
│   Draft → In Review → Approved → Exported                       │
│   ├ Preview MP4                                                  │
│   ├ Comment / Request revision (loop back to Scripter)          │
│   └ Approve                                                      │
│        │                                                         │
│        ▼                                                         │
│  Export Center                                                  │
│   ├ Download MP4                                                 │
│   ├ Copy caption + hashtag (per platform: TikTok/FB/YT)         │
│   └ Manual upload (MVP) / Auto-publish API (Phase 2)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Kiến trúc hệ thống

### 4.1 Tech stack

| Layer | Lựa chọn | Lý do |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + Tailwind + shadcn/ui | SSR, server actions, ecosystem mạnh |
| **Backend** | Next.js Route Handlers + Server Actions | Cùng codebase, deploy đơn giản |
| **Auth & DB & Storage** | Supabase (Postgres + Auth + Storage) | All-in-one, free tier đủ MVP |
| **LLM** | Claude API (Anthropic SDK) | Reasoning tốt cho Planner/Auditor, model `claude-sonnet-4-6` cho task chính, `claude-haiku-4-5-20251001` cho task rẻ |
| **TTS** | ElevenLabs API | Chất lượng giọng Việt tốt nhất hiện tại |
| **Avatar** | HeyGen API | Stock avatar đủ cho MVP |
| **Render** | Creatomate API | Render hộ trên cloud, không cần self-host ffmpeg |
| **Encryption** | Supabase Vault / pgcrypto | Mã hóa API keys |
| **Deploy** | Vercel (Next.js) + Supabase Cloud | Zero-ops cho MVP |

### 4.2 Sơ đồ module

```
┌──────────────────────────────────────────────────────────┐
│  Admin UI (Next.js)                                       │
│  ├ /dashboard       ├ /profiles    ├ /footage           │
│  ├ /projects        ├ /review      ├ /export            │
│  └ /settings/integrations                                │
└──────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────┐
│  Application Layer (Server Actions / API Routes)         │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Profile Mgr  │  │ Footage Mgr  │  │ Project Mgr  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Agent Orchestrator                              │    │
│  │  Planner → Scripter → Auditor → Voicer → Render  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────┐
│  M0. Integration Hub                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Provider Registry │ Credential Vault │ Adapters   │  │
│  │ Usage Meter       │ Health Checker   │ Rate Limit │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          │
       ┌──────────┬──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼          ▼
   Claude    ElevenLabs   HeyGen   Creatomate  Supabase
                                              (Storage)
```

### 4.3 Data model (Postgres schema)

```sql
-- ─────────────── AUTH (do Supabase quản lý) ───────────────
-- auth.users (built-in)

-- ─────────────── INTEGRATION HUB ───────────────
create type provider_kind as enum ('llm','tts','avatar','render','publish','storage');

create table providers (
  id uuid primary key default gen_random_uuid(),
  kind provider_kind not null,
  name text not null,                  -- 'claude','elevenlabs','heygen','creatomate'
  is_default boolean default false,
  config jsonb default '{}',           -- model, voice_id mặc định, region
  enabled boolean default true,
  created_at timestamptz default now()
);

create table provider_credentials (
  provider_id uuid primary key references providers(id) on delete cascade,
  secret_ciphertext bytea not null,    -- pgcrypto
  rotated_at timestamptz default now(),
  expires_at timestamptz
);

create table provider_usage (
  id bigserial primary key,
  provider_id uuid references providers(id),
  date date not null,
  units_used numeric default 0,        -- tokens / chars / sec / requests
  cost_estimate_usd numeric default 0,
  unique(provider_id, date)
);

create table provider_health (
  id bigserial primary key,
  provider_id uuid references providers(id),
  checked_at timestamptz default now(),
  ok boolean,
  latency_ms int,
  error text
);

-- ─────────────── CONTENT DOMAIN ───────────────
create table profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  industry text default 'personal_banking',
  role text,                           -- 'Personal Banker - VPBank'
  expertise jsonb,                     -- {products:[], yearsExp, certificates}
  audience jsonb,                      -- {segment, painPoints, goals}
  tone jsonb,                          -- {voice:'trustworthy', forbidden:[]}
  usp text,                            -- unique selling proposition
  voice_sample_url text,               -- để clone giọng (phase 2)
  created_at timestamptz default now()
);

create type footage_tag as enum ('intro','talking','broll','cta','outro','other');

create table footage_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  duration_sec numeric,
  tag footage_tag not null,
  notes text,
  uploaded_at timestamptz default now()
);

create type project_status as enum ('planning','scripting','rendering','review','approved','exported','rejected');

create table projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  topic text not null,
  brief text,
  status project_status default 'planning',
  scheduled_for date,
  created_at timestamptz default now()
);

create table content_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  period_start date,
  period_end date,
  topics jsonb,                        -- [{topic, hook, target_persona, format}]
  generated_by_model text,
  created_at timestamptz default now()
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  hook text,
  body text,
  cta text,
  caption text,
  hashtags text[],
  variant_prompts jsonb,               -- {talking, broll, animation}
  audit_status text default 'pending', -- pending/pass/fail
  audit_notes jsonb,
  generated_by_model text,
  version int default 1,
  created_at timestamptz default now()
);

create table audio_assets (
  id uuid primary key default gen_random_uuid(),
  script_id uuid references scripts(id) on delete cascade,
  storage_path text not null,
  duration_ms int,
  voice_id text,
  cost_usd numeric,
  created_at timestamptz default now()
);

create type concept_kind as enum ('talking','broll','animation');
create type render_status as enum ('queued','rendering','done','failed');

create table video_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  script_id uuid references scripts(id),
  audio_id uuid references audio_assets(id),
  concept concept_kind not null,
  render_provider text,                -- 'heygen' | 'creatomate'
  render_job_id text,
  render_status render_status default 'queued',
  output_url text,
  duration_sec numeric,
  cost_usd numeric,
  error text,
  created_at timestamptz default now()
);

create type approval_state as enum ('pending','approved','rejected','revision_requested');

create table approvals (
  id uuid primary key default gen_random_uuid(),
  video_draft_id uuid references video_drafts(id) on delete cascade,
  reviewer_id uuid references auth.users(id),
  state approval_state default 'pending',
  comment text,
  created_at timestamptz default now()
);

create table exports (
  id uuid primary key default gen_random_uuid(),
  video_draft_id uuid references video_drafts(id),
  platform text,                       -- 'tiktok','facebook','youtube_shorts'
  caption_localized text,
  hashtags_localized text[],
  exported_at timestamptz default now()
);

-- ─────────────── INDEXES & RLS ───────────────
create index idx_footage_profile on footage_assets(profile_id, tag);
create index idx_projects_status on projects(profile_id, status);
create index idx_drafts_project on video_drafts(project_id, concept);

-- RLS bật cho mọi table, user chỉ thấy data của mình
alter table profiles enable row level security;
-- ... (policies chi tiết trong migration)
```

### 4.4 Provider Adapter interface

```ts
// lib/integration-hub/types.ts
export interface LLMProvider {
  complete(input: {
    system?: string
    messages: { role: 'user'|'assistant'; content: string }[]
    model?: string
    maxTokens?: number
    responseFormat?: 'text' | 'json'
  }): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number }>
}

export interface TTSProvider {
  synthesize(input: { text: string; voiceId: string; lang: string }):
    Promise<{ audioBlob: Blob; durationMs: number; costUsd: number }>
}

export interface AvatarProvider {
  renderTalking(input: {
    script: string
    audioUrl: string
    avatarId: string
    aspectRatio: '9:16' | '16:9' | '1:1'
  }): Promise<{ jobId: string }>
  poll(jobId: string): Promise<{ status: 'queued'|'rendering'|'done'|'failed'; outputUrl?: string; error?: string }>
}

export interface RenderProvider {
  render(input: {
    templateId: string
    modifications: Record<string, unknown>
  }): Promise<{ jobId: string }>
  poll(jobId: string): Promise<{ status: 'queued'|'rendering'|'done'|'failed'; outputUrl?: string }>
}

// lib/integration-hub/hub.ts
export const hub = {
  llm: (name?: string) => loadAdapter<LLMProvider>('llm', name),
  tts: (name?: string) => loadAdapter<TTSProvider>('tts', name),
  avatar: (name?: string) => loadAdapter<AvatarProvider>('avatar', name),
  render: (name?: string) => loadAdapter<RenderProvider>('render', name),
}
```

Module nghiệp vụ luôn gọi `hub.tts().synthesize(...)`, không bao giờ `import elevenlabs`.

---

## 5. Module Specifications

### M0. Integration Hub
**Mục đích**: Centralized API connection manager.

**Features (MVP)**
- Provider Registry CRUD (UI `/settings/integrations`).
- Credential Vault với pgcrypto, secret không bao giờ trả về plain qua API.
- Adapter interface chuẩn cho 5 loại: LLM / TTS / Avatar / Render / Storage.
- Test connection button cho mỗi provider.
- Usage Meter: log mỗi call (units_used, cost_estimate) → dashboard tổng cost theo ngày.
- Rate limiter + exponential retry (3 lần, base 2s).

**Features (Phase 2)**
- Multi-provider per kind + auto-failover.
- Health Checker cron (5 phút/lần).
- Multi-tenant credentials (mỗi workspace key riêng).
- Quota alert webhook.

**Acceptance**
- Đổi API key qua UI, không cần redeploy, lần call kế tiếp dùng key mới.
- Cost dashboard hiển thị USD/ngày per provider trong vòng 5 giây sau call.

---

### M1. Auth & Workspace
**Mục đích**: Đăng nhập, mỗi user 1 workspace.

**Features (MVP)**: Email/password + magic link (Supabase Auth), profile cơ bản, RLS isolation.

**Phase 2**: Team workspace, role (owner/editor/reviewer), invite member.

---

### M2. Profile Manager
**Mục đích**: Quản lý profile chuyên môn — input chính của Planner.

**Features (MVP)**
- Form template Personal Banker: tên, vị trí, ngân hàng, năm kinh nghiệm, sản phẩm phụ trách, chứng chỉ, audience segment, pain point khách, tone voice.
- Import từ JSON/PDF (LLM extract).
- Preview "AI sẽ thấy profile bạn thế nào" (debug prompt).

**Phase 2**: Multi-profile per user, profile template cho ngành khác (coach, doctor, lawyer).

**Acceptance**: Tạo profile xong, click "Generate sample script" → Claude trả về 1 script ≤ 30s.

---

### M3. Footage Library
**Mục đích**: Upload và quản lý raw shot.

**Features (MVP)**
- Drag-drop upload (max 500MB/file, mp4/mov).
- Server-side ffmpeg generate thumbnail (frame 1s).
- User tự gắn tag: intro / talking / broll / cta / outro / other.
- Notes field tự do (vd "shot cận, ánh sáng vàng").
- Grid view filter theo tag.

**Phase 2**: Auto-tag bằng vision model (CLIP/Gemini), auto-trim, scene detection.

**Acceptance**: Upload 10 video, mỗi video có thumbnail và tag đúng, Renderer query được footage theo tag.

---

### M4. Content Planner (Agent)
**Mục đích**: Sinh content calendar từ profile.

**Features (MVP)**
- Input: profile + period (vd 1 tháng) + frequency (vd 3 video/tuần).
- Claude (model `claude-sonnet-4-6`) prompt sinh N chủ đề có: topic, hook, target persona, format gợi ý, độ ưu tiên.
- Output JSON structured, lưu `content_plans` table.
- User chọn chủ đề → tạo `projects` record.

**Phase 2**: Trend integration (Google Trends, TikTok trending), regenerate dựa trên analytics feedback.

**Prompt skeleton**:
```
Bạn là content strategist cho Personal Banker tại Việt Nam.
Profile: {profile_json}
Hãy đề xuất {N} chủ đề video ngắn cho 30 ngày tới.
Mỗi chủ đề cần:
- topic (≤15 từ)
- hook (1 câu mở đầu thu hút)
- target_persona (khách hàng cụ thể)
- pain_point (vấn đề giải quyết)
- format_hint (educate/story/cta)
- priority (1-5)
Trả về JSON array.
```

---

### M5. Script Generator (Agent)
**Mục đích**: Sinh script chi tiết cho 1 project + variant prompt cho 3 concept.

**Features (MVP)**
- Input: project + profile + chọn độ dài (30s/60s/90s).
- Output:
  - `hook` (3-5s)
  - `body` (60-80% thời lượng)
  - `cta` (5-10s)
  - `caption` (cho social post)
  - `hashtags` (10-15 tags Việt + ngành)
  - `variant_prompts`:
    - `talking`: prompt cho HeyGen (script đầy đủ)
    - `broll`: shot list + voice-over text + footage tag gợi ý
    - `animation`: data points + key messages + visual cues
- Lưu `scripts` với `version`, hỗ trợ regenerate khi revision.

**Phase 2**: A/B test variant hooks, multi-language.

**Acceptance**: 1 click sinh script đầy đủ < 30s, đúng tone Personal Banker.

---

### M6. Voice Engine (Agent)
**Mục đích**: TTS script → audio.

**Features (MVP)**
- ElevenLabs API qua Hub TTSProvider adapter.
- Default voice Việt nam (stock voice ElevenLabs).
- Lưu MP3 vào Supabase Storage, record vào `audio_assets`.
- Track cost per generation.

**Phase 2**: Voice cloning từ `voice_sample_url`, multi-voice cho dialogue, SSML để control pause/emphasis.

**Acceptance**: Script 60s → MP3 < 20 giây render, chất lượng nghe rõ.

---

### M7. Video Assembler (3 concept)
**Mục đích**: Render 3 video draft song song.

#### M7-C1: Talking Head (HeyGen)
- AvatarProvider adapter gọi HeyGen API: script + audioUrl + stock avatar (Vietnamese male/female).
- Aspect ratio 9:16 (TikTok/Reels).
- Poll job → save `output_url` vào `video_drafts`.

#### M7-C2: B-roll Storytelling (Creatomate)
- Creatomate template với slot: `voice_track`, `bg_music`, `shot_1..N`, `caption_overlay`.
- Query footage tagged `broll` từ M3 → fill slot.
- Burn-in subtitle từ script.

#### M7-C3: Animation (Creatomate motion graphics)
- Creatomate template animation: text reveal, data viz (số liệu lãi suất, biểu đồ), icon banking, brand color.
- Voice-over track.
- Không cần footage thật.

**Orchestration**: Sau khi script approve + audio ready, enqueue 3 render job song song. UI show progress 3 bar.

**Acceptance**: Cùng 1 script → 3 MP4 9:16 khác phong cách rõ rệt, < 15 phút tổng.

---

### M8. Compliance Auditor (Agent)
**Mục đích**: Kiểm duyệt script trước khi render, tránh vi phạm luật quảng cáo TC.

**Features (MVP)**
- Sau khi M5 sinh script, M8 chạy trước M6/M7.
- Claude (model `claude-sonnet-4-6`) prompt với rule set ngành banking VN:
  - Không hứa lợi nhuận cụ thể.
  - Không nói "an toàn 100%".
  - Không so sánh trực tiếp với ngân hàng khác.
  - Phải có disclaimer cho sản phẩm đầu tư.
  - Không dùng từ ngữ gây hiểu nhầm về bảo hiểm/tín dụng.
- Output: `pass` / `fail` + danh sách issue + suggestion fix.
- Nếu `fail`: block render, hiển thị issue cho user, cho phép edit script & re-audit.

**Phase 2**: Rule editor UI cho mỗi ngành, lưu history audit, train custom classifier.

**Acceptance**: Inject 1 script vi phạm chứa "lãi suất 100% an toàn cao nhất thị trường" → Auditor flag, không render.

---

### M9. Admin Review UI
**Mục đích**: Duyệt video draft.

**Features (MVP)**
- Kanban 4 cột: Draft / In Review / Approved / Exported.
- Card hiển thị: thumbnail, concept badge, project topic.
- Click card → modal: 3 video preview (3 concept side-by-side), script, caption, audit report.
- Action per draft: Approve / Reject / Request revision (kèm comment).
- Request revision → loop về M5 với feedback, version++ trong `scripts`.

**Phase 2**: Multi-reviewer + sign-off flow, inline comment trên timeline video.

**Acceptance**: Reviewer hoàn tất 1 lượt duyệt (preview → approve) trong < 2 phút.

---

### M10. Export Center
**Mục đích**: Lấy MP4 + caption + hashtag.

**Features (MVP)**
- Per approved draft: download MP4 button.
- Tab cho từng platform (TikTok/FB/YT): caption localized + hashtag list, copy-to-clipboard.
- Đánh dấu `exported` trong `exports` table.

**Phase 2**: Auto-publish qua TikTok Content Posting API / Meta Graph / YouTube Data API, scheduling, queue.

---

## 6. Phase Roadmap

### Phase 0 — Setup (Day 0, trước D1)
- API keys: Anthropic, ElevenLabs, HeyGen, Creatomate, Supabase project.
- Profile mẫu Personal Banker (1 file JSON).
- 5-10 footage clip mẫu (có thể stock).
- 2-3 Creatomate template dựng sẵn (b-roll, animation).

### Phase 1 — MVP 7 ngày

| Day | Mục tiêu | Modules | Deliverable |
|---|---|---|---|
| **D1** | Foundation | Project scaffold, Supabase setup, DB migration, M1 Auth | Login được, schema deployed |
| **D2** | Hub + Profile | **M0 Integration Hub** core, M2 Profile Manager | Add provider qua UI, test connection OK, tạo profile mẫu |
| **D3** | Footage + Planner | M3 Footage Library, M4 Content Planner | Upload 10 footage có tag, sinh 12 chủ đề content calendar |
| **D4** | Scripter + Auditor + Voice | M5 Script Generator, M8 Compliance Auditor, M6 Voice Engine | Từ 1 chủ đề → script + audit pass + MP3 audio |
| **D5** | Render C1 + C2 | M7-C1 (HeyGen), M7-C2 (Creatomate b-roll) | 2 video MP4 ra được, render song song |
| **D6** | Render C3 + Review UI | M7-C3 (animation), M9 Admin Review UI | Kanban hoạt động, preview 3 concept, approve/revision |
| **D7** | Export + Polish | M10 Export Center, end-to-end test, bug fix | Demo: 1 profile → 3 video MP4 download được, < 30 phút |

**Định nghĩa Done cho MVP**:
- [ ] Login.
- [ ] Add 4 provider (Claude/ElevenLabs/HeyGen/Creatomate) qua Hub UI, test pass.
- [ ] Tạo profile Personal Banker mẫu.
- [ ] Upload ≥ 5 footage có tag.
- [ ] Sinh content plan ≥ 10 chủ đề.
- [ ] Pick 1 chủ đề → script → audit pass → 3 video draft render done.
- [ ] Approve 3 draft, export MP4 + caption.
- [ ] Tổng cost dashboard hiển thị USD đã tiêu.

### Phase 2 — Production Hardening (Tuần 2-3)
- M0: Multi-provider, auto-failover, health cron, quota alert.
- M3: Auto-tag footage bằng vision AI.
- M5: A/B test hook variants.
- M6: Voice cloning từ sample.
- M7: Custom HeyGen avatar.
- M9: Multi-reviewer sign-off, inline timeline comment.
- M10: TikTok auto-publish (Content Posting API).
- Observability: structured logging, Sentry, render queue dashboard.

### Phase 3 — Scale & Intelligence (Tháng 2)
- Analytics dashboard: thu view/like/comment từ TikTok/FB → feedback loop về Planner.
- Auto-publish đủ 3 platform.
- Trend integration (Google Trends, TikTok Creative Center).
- Schedule + content calendar UI dạng lịch.
- Bulk operation: 1 profile → 20 video/tháng auto-pipeline.

### Phase 4 — Multi-tenant SaaS (Tháng 3+)
- Multi-workspace, team roles, billing.
- Persona template marketplace (Banker, Coach, Doctor, Lawyer...).
- Custom rule editor cho Auditor theo ngành.
- White-label cho agency.
- CRM + seeding tools (như box "Tools" trong whiteboard).

---

## 7. Non-functional Requirements

### 7.1 Bảo mật
- API key luôn mã hóa at-rest bằng pgcrypto.
- RLS bật trên mọi bảng, user chỉ truy cập data của mình.
- Server actions validate session + ownership trước khi mutate.
- File upload kiểm tra MIME, max size, virus scan (phase 2).

### 7.2 Hiệu năng
- Render 3 concept song song, không tuần tự.
- LLM call dùng streaming khi có thể (script preview).
- Cache content plan, profile để tránh re-call Claude.
- Image/video lazy load trong UI.

### 7.3 Chi phí (ước tính per 1 chủ đề → 3 video)
| Item | Cost |
|---|---|
| Claude (Planner + Scripter + Auditor) | ~$0.05 |
| ElevenLabs TTS (60s) | ~$0.10 |
| HeyGen render (60s) | ~$0.30 |
| Creatomate render × 2 | ~$0.20 |
| **Tổng** | **~$0.65 / 3 video** |

Mục tiêu < $1/chủ đề để khả thi commercial.

### 7.4 Reliability
- Mọi external call qua Hub có retry 3 lần exponential backoff.
- Render job failed → tự retry 1 lần, lần 2 fail thì notify admin.
- Job status persist trong DB, recover được sau crash.

### 7.5 Compliance & Legal
- Auditor agent là bắt buộc cho ngành banking.
- Disclaimer auto-append vào caption cho sản phẩm đầu tư.
- Log lưu giữ ≥ 90 ngày cho audit trail.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HeyGen quota giới hạn / API thay đổi | High | Hub adapter pattern → swap D-ID dễ; cảnh báo quota 80% |
| Voice tiếng Việt ElevenLabs kém | Medium | Test sớm D4, fallback PlayHT |
| Creatomate template phức tạp tốn thời gian design | Medium | MVP dùng 2 template đơn giản, có thể outsource designer |
| TikTok API khó duyệt | Low (MVP manual) | Phase 2 mới làm, không block MVP |
| Compliance Auditor false negative (cho qua nội dung vi phạm) | High | Human-in-the-loop bắt buộc trong MVP (M9), không skip review |
| Claude rate limit | Medium | Hub rate limiter, fallback model Haiku, cache |
| 7 ngày không đủ | High | Cut M0 thành "MVP minimal" (1 provider/kind, không multi), giữ 6 module core |

---

## 9. Open questions (cần quyết trong quá trình build)

- Voice ID mặc định ElevenLabs Vietnamese nào dùng cho Personal Banker (nam/nữ, độ tuổi)?
- Style/brand color cho Creatomate template animation?
- Tần suất content calendar mặc định (3/tuần hay 5/tuần)?
- Có cần watermark/logo trên video MVP không?
- Aspect ratio MVP chỉ 9:16 hay làm thêm 1:1 cho FB?

---

## 10. Appendix

### 10.1 Folder structure đề xuất

```
VideoSystem/
├── app/
│   ├── (auth)/login
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── profiles/
│   │   ├── footage/
│   │   ├── projects/[id]/
│   │   ├── review/
│   │   ├── export/
│   │   └── settings/integrations/
│   └── api/
│       ├── webhooks/creatomate/route.ts
│       └── webhooks/heygen/route.ts
├── lib/
│   ├── integration-hub/
│   │   ├── types.ts
│   │   ├── hub.ts
│   │   ├── vault.ts
│   │   └── adapters/
│   │       ├── claude.ts
│   │       ├── elevenlabs.ts
│   │       ├── heygen.ts
│   │       └── creatomate.ts
│   ├── agents/
│   │   ├── planner.ts
│   │   ├── scripter.ts
│   │   ├── auditor.ts
│   │   └── orchestrator.ts
│   ├── db/
│   │   ├── schema.sql
│   │   └── client.ts
│   └── storage/
├── components/
│   ├── ui/                 (shadcn)
│   ├── kanban/
│   ├── footage-grid/
│   └── video-preview/
├── supabase/
│   └── migrations/
└── PRD.md                  (this file)
```

### 10.2 Glossary
- **Concept**: 1 trong 3 phong cách dựng video (talking / b-roll / animation).
- **Draft**: 1 record `video_drafts`, output 1 file MP4 chưa publish.
- **Project**: 1 chủ đề content, sinh ra 1 script và 3 draft (3 concept).
- **Provider**: nhà cung cấp dịch vụ ngoài (Claude, ElevenLabs, HeyGen...).
- **Hub**: M0 Integration Hub.
- **Agent**: 1 module dùng LLM để thực hiện task (Planner, Scripter, Auditor).

---

**End of PRD v1.0**
