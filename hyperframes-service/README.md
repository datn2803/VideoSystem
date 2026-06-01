# HyperFrames Render Service

HTTP service render video 9:16 (1080×1920) bằng HyperFrames cho app VideoSystem — thay Creatomate cho **C2 (B-roll)** và **C3 (Animation)**. Font Be Vietnam Pro + GSAP **vendor local** (deterministic, chạy offline trong Docker).

## Chạy local
```bash
npm install
PORT=8090 RENDER_TOKEN=test node server.mjs
curl localhost:8090/health
```
Render thủ công 1 template (CLI dùng `--composition`, KHÔNG nhận file path trần):
```bash
npx hyperframes@0.6.63 render . --composition compositions/animation.html \
  --quality draft --variables '{"hook_keyword":"XIN CHÀO"}' --output renders/out.mp4
```
Deploy VPS: xem `DEPLOY.md`.

## API
- `GET /health` → `{ ok, templates, storage }`
- `POST /render` (header `Authorization: Bearer <RENDER_TOKEN>`)
  ```json
  { "template": "animation" | "broll", "quality": "draft|standard|high", "variables": { ... } }
  ```
  → có Supabase: `{ ok, url, durationSec, sizeBytes }` · không Supabase: trả thẳng bytes MP4.

## Templates & biến (Phase 2 sẽ map script → các biến này)

### `animation` (C3 — motion-graphics 4 scene, ~18.5s)
| Biến | Type | Mặc định |
|---|---|---|
| `hook_line1` | text | "Hầu hết người" |
| `hook_line2` | text | "làm content" |
| `hook_keyword` | text | "Đang vô hình" (đỏ, phóng to) |
| `hook_sub` | text | "— và đây là lý do" |
| `data_title` | text | tiêu đề nhỏ scene data |
| `data_a_label` / `data_a_value` / `data_a_unit` | text | cột "thắng" (đếm số nếu value là số) |
| `data_b_label` / `data_b_value` / `data_b_unit` | text | cột "thua" |
| `data_ghost` | text | chữ nền mờ scene data |
| `levels_title` | text | tiêu đề scene levels |
| `levels` | text (JSON) | mảng `[{n,label,desc,locked,active}]` — rỗng `[]` → ẩn scene 3 |
| `cta_top` / `cta_keyword` / `cta_sub` | text | scene kết |
| `accent_color` | color | "#e11d2a" |

### `broll` (C2 — footage/ảnh + voice-over + kinetic caption)
| Biến | Type | Mặc định |
|---|---|---|
| `duration` | number | tổng thời lượng giây (khớp voice-over; service nướng vào bản render) |
| `bg_type` | enum | "image" \| "video" |
| `bg_urls` | string (JSON) | mảng URL string — nhiều ảnh = chia đều + Ken Burns |
| `voice_url` | string | URL voice-over (mp3/wav) |
| `caption_lines` | string (JSON) | mảng `[{text, keyword, start, dur}]` — keyword tô đỏ |
| `accent_color` | color | "#e11d2a" |

> Mọi text gán bằng `textContent` (chữ Việt chuẩn dấu + chống injection). JSON parse có fallback an toàn. Render spawn bằng mảng args (không shell-inject); variables truyền qua file.
