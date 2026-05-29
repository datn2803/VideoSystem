# Supabase Setup (D8) — Persist data across Vercel cold starts

## 1. Tạo Supabase project (2 phút)

1. Mở https://supabase.com → Sign in (login bằng GitHub dễ nhất)
2. Click **"New project"**
3. Điền:
   - **Project name**: `videosystem` (hoặc gì cũng được)
   - **Database Password**: tạo strong password, lưu lại (mình không cần dùng)
   - **Region**: chọn `Southeast Asia (Singapore)` cho Việt Nam — latency tốt nhất
   - **Pricing Plan**: Free
4. Click **Create new project** → chờ ~2 phút

## 2. Tạo bảng kv_store (30 giây)

Sau khi project ready:

1. Sidebar trái → **SQL Editor**
2. Click **New query**
3. Paste nội dung file `supabase/migrations/0002_kv_store.sql`:

```sql
create table if not exists kv_store (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;
```

4. Click **Run** (Cmd+Enter / Ctrl+Enter)
5. Thấy "Success. No rows returned" → OK

## 3. Tạo 3 Storage Buckets (1 phút)

1. Sidebar trái → **Storage**
2. Click **New bucket**, lặp lại 3 lần để tạo:

| Bucket name | Public | Mục đích |
|---|---|---|
| `uploads` | ✅ Public bucket | Raw footage user upload |
| `audio` | ✅ Public bucket | TTS audio MP3 |
| `videos` | ✅ Public bucket | Rendered video MP4 |

⚠️ **PHẢI tích "Public bucket"** để client load được file trực tiếp qua URL.

## 4. Lấy 3 env vars (30 giây)

1. Sidebar trái → **Project Settings** (icon bánh răng góc dưới trái)
2. Click **API**
3. Copy 3 giá trị:

```
NEXT_PUBLIC_SUPABASE_URL    = Project URL (vd: https://xxxxx.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY = anon public key (jwt dài)
SUPABASE_SERVICE_ROLE_KEY    = service_role secret (jwt dài, KEY QUAN TRỌNG)
```

⚠️ **Service role key** có quyền full DB. Không commit vào Git, không paste vào client code.

## 5. Add env vars vào Vercel (1 phút)

1. Vào Vercel project `video-system` → **Settings** → **Environment Variables**
2. Add 3 vars:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (paste URL) | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (paste anon key) | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | (paste service role key) | Production, Preview, Development |

3. Click **Save**

## 6. Redeploy

1. Vercel project → **Deployments** tab
2. Click ⋯ trên deployment mới nhất → **Redeploy**
3. Đợi ~2 phút

Sau khi redeploy:
- App detect SUPABASE env vars → tự động switch từ `/tmp` sang Supabase
- Banner "Demo mode trên Vercel" sẽ biến mất
- Data persist vĩnh viễn qua cold start, refresh, redeploy

## 7. Verify

Sau redeploy:
1. Vào URL Vercel → tạo profile, plan, script, audio, video
2. Đợi 15-20 phút (cho cold start chắc chắn xảy ra)
3. Refresh → data vẫn còn → ✅ thành công

## Troubleshoot

| Lỗi | Cách fix |
|---|---|
| "Bucket not found" khi upload | Tạo đủ 3 bucket: uploads/audio/videos, tất cả Public |
| "Row violates RLS policy" | Đảm bảo dùng SERVICE_ROLE_KEY (không phải anon) |
| File upload nhưng URL 404 | Bucket chưa set Public |
| Vẫn thấy banner "Demo mode" | Env vars chưa add đúng / chưa redeploy |

## Quota Supabase Free Tier

- Database: 500MB (đủ ~1 triệu records)
- Storage: 1GB (đủ ~50 video MP4 60s 9:16)
- Bandwidth: 5GB/tháng
- Restart tự động nếu inactive 1 tuần (data không mất, chỉ pause)

Khi gần hết quota, upgrade Pro $25/tháng.
