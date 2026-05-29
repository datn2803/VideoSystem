# VideoSystem — Content Automation cho Personal Branding

Hệ thống dây chuyền sản xuất nội dung video tự động hóa từ profile chuyên gia + raw footage → 3 concept video draft sẵn sàng upload đa nền tảng.

**Persona MVP:** Personal Banker (ngân hàng cá nhân)
**Tech stack:** Next.js 15 + Tailwind v4 + TypeScript + Claude/Gemini/ElevenLabs/HeyGen/Creatomate

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

App chạy được ngay không cần API key — mock provider sẽ replace tất cả LLM/TTS/Avatar/Render call. Khi paste key thật vào `/settings/integrations`, các adapter thật được kích hoạt.

## Pipeline 10 module

```
Profile (M2) → Planner (M4) → Scripter (M5) → Auditor (M8) → Voice (M6)
   → Render 3 concept (M7: Talking/B-roll/Animation)
   → Review Kanban (M9) → Export Center (M10)
   ↑
   M0 Integration Hub điều phối các provider
   M3 Footage Library cung cấp raw shot cho C2 B-roll
```

## Folder structure

```
src/
├── app/(app)/
│   ├── dashboard/     # tổng quan + onboarding
│   ├── profiles/      # M2 Profile Manager
│   ├── footage/       # M3 Footage Library
│   ├── projects/      # M4 Planner UI
│   ├── scripts/       # M5+M8 Script + Audit detail
│   ├── review/        # M9 Kanban duyệt
│   ├── export/        # M10 Download MP4 + caption per platform
│   └── settings/integrations/  # M0 Hub UI
├── app/audio/[filename]/    # serve audio files
├── app/uploads/[filename]/  # serve raw footage
├── app/videos/[filename]/   # serve rendered videos
├── lib/
│   ├── integration-hub/    # M0: types, hub, vault, adapters/, catalog
│   ├── agents/             # planner, scripter, auditor
│   ├── audio/              # M6 Voice Engine
│   ├── footage/            # M3
│   ├── scripts/            # M5 storage + actions
│   ├── video/              # M7 storage + builders + orchestrator
│   ├── review/             # M9 actions
│   └── export/             # M10 caption-localizer + actions
└── components/             # UI components per module
```

## Configuring providers

Vào `/settings/integrations` → Add provider. Hỗ trợ:

| Kind | Providers | Free tier |
|---|---|---|
| LLM | Claude, Gemini | Gemini free 15 req/min |
| TTS | ElevenLabs, FPT.AI | ElevenLabs 10k chars/tháng |
| Avatar | HeyGen, D-ID | D-ID 14d trial; HeyGen từ $99 |
| Render | Creatomate | Free 50 credits |

Key được mã hóa AES-256-GCM trước khi lưu tại `.data/db.json`.

## Storage

MVP dùng filesystem local tại `.data/` (auto-gitignored):
- `.data/db.json` — providers, credentials, profiles, usage, health
- `.data/audio.json` + `audio/` — generated MP3
- `.data/videos.json` + `videos/` — rendered MP4
- `.data/footage.json` + `uploads/` — raw footage
- `.data/exports.json` — export records

Swap sang Supabase: chỉ cần thay implementation trong `lib/integration-hub/storage.ts` (interface giữ nguyên).

## Build & deploy

### Build local

```bash
npm run build       # production build
npm run start       # serve production
```

### Deploy Vercel (free, có URL public sau ~3 phút)

1. Truy cập https://vercel.com/new
2. Login bằng GitHub
3. Import repo `claudemagentx-boop/VideoSystem`
4. Chọn branch `claude/video-content-automation-PYlvQ`
5. Click **Deploy** — Vercel auto-detect Next.js, không cần config thêm
6. Sau ~3 phút có URL kiểu `videosystem-xxx.vercel.app`

**Lưu ý quan trọng (Vercel free):**
- Mặc định: `/tmp` ephemeral → data mất giữa cold start
- **Để persist data**: theo hướng dẫn ở `supabase/SETUP.md` (~5 phút, free forever)
- App auto-detect SUPABASE env vars → switch sang Postgres + Storage

App tự detect `process.env.VERCEL` và dùng `/tmp/videosystem-data` thay `.data/` khi chạy serverless. Dashboard hiển thị banner warning khi ở demo mode.

## Scope

✅ MVP (D1-D7) — pipeline end-to-end 10 module
⏳ Phase 2 — Auto-publish TikTok/FB/YT, voice cloning, custom avatar
⏳ Phase 3 — Analytics feedback loop, trend integration
⏳ Phase 4 — Multi-tenant SaaS, persona marketplace

Xem `PRD.md` để biết chi tiết spec đầy đủ.
