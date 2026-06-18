# Deploy — HyperFrames Render Service (Phase 1 + 2 async)

> 💡 **Cách khác — chạy LOCAL trên Mac + Cloudflare Tunnel** (không cần VPS): xem [`RUN_LOCAL.md`](RUN_LOCAL.md).
> Tài liệu VPS bên dưới GIỮ LÀM THAM KHẢO (vẫn deploy được lên VPS như cũ).

Deploy lên **VPS Hostinger** đã có sẵn Docker + Traefik. Đi đường **đơn giản nhất: IP + token, cổng 8080, KHÔNG domain/TLS/Traefik**. App gọi `http://76.13.223.45:8080` kèm Bearer token.

> **PHASE 2 — service nay là ASYNC.** `POST /render` trả ngay `202 {jobId}`, render chạy nền; app **poll** `GET /jobs/:jobId` tới khi `done` rồi lấy `url`. (Vì render ~40-120s > giới hạn ~60s của Vercel → không thể gọi đồng bộ.)
>
> **BẮT BUỘC điền Supabase** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=videos`) trên VPS — lấy đúng các giá trị này từ env app trên Vercel để app đọc được video. Bucket `videos` phải **tồn tại + public**. (Nếu thiếu Supabase, service tự rớt về chế độ phục vụ file qua HTTP `GET /files/:name` — chỉ để test local; production PHẢI dùng Supabase để URL bền vững.)

> Môi trường VPS (đã xác nhận): Hostinger KVM2 · Ubuntu 24.04 · 2 vCPU · 7.8GB RAM · Docker 29.4.3 · Compose v5.1.3 · Traefik chạy sẵn (`traefik-traefik-1`) · IP `76.13.223.45`.
> ⚠️ KHÔNG cài lại Docker, KHÔNG đụng container `traefik-traefik-1`. Cổng 8080 khác 80/443 nên không xung đột.

---

## 1. Đưa code lên VPS

```bash
ssh root@76.13.223.45
# Cách A — git:
git clone <repo-url> hyperframes-service && cd hyperframes-service
# Cách B — scp từ máy Mac (chạy ở máy Mac):
#   scp -r ~/Desktop/hyperframes-service root@76.13.223.45:~/hyperframes-service
```

## 2. Tạo file `.env`

```bash
cp .env.example .env
nano .env
```

Điền:
- `RENDER_TOKEN` = chuỗi ngẫu nhiên **mạnh ≥32 ký tự**. Sinh nhanh: `openssl rand -hex 32`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=videos` — nếu muốn service upload MP4 lên Supabase và trả URL.
  - **Bỏ trống cả 3** → service trả thẳng file MP4 trong HTTP response (tiện test, nhưng nặng; production nên dùng Supabase).
- `PORT=8080` (giữ nguyên).

> 🔒 `.env` đã nằm trong `.gitignore` — KHÔNG commit. KHÔNG để lộ `RENDER_TOKEN`.

## 3. (Khuyến nghị) Thêm 2GB swap

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # giữ swap sau reboot
```

## 4. Build + chạy

```bash
docker compose up -d --build
```

- Build lần đầu ~3-6 phút (apt cài Chromium libs + `hyperframes browser install` tải Chromium + smoke-render kiểm tra pipeline). **Nếu build fail ở bước smoke-render** → pipeline render có vấn đề (font/gsap), xem log build.
- VPS là x86_64 nên build thẳng trên VPS là chuẩn nhất (KHÔNG cần `--platform`).

Kiểm tra:
```bash
docker compose ps                 # hf-render = Up (healthy)
docker compose logs -f hf-render  # thấy: [hf-render] listening on :8080
```

## 5. Mở cổng 8080

```bash
ufw status && ufw allow 8080/tcp   # nếu ufw đang bật
# Hostinger hpanel: mục "Tường lửa" (Firewall) → thêm rule cho phép TCP 8080 (inbound).
```

## 6. Test từ ngoài (ASYNC: render → poll)

```bash
curl http://76.13.223.45:8080/health
# → {"ok":true,"templates":["animation","broll"],"storage":"supabase","mode":"async"}

# B1. Tạo job — trả NGAY 202 {jobId}
JOB=$(curl -s -X POST http://76.13.223.45:8080/render \
  -H "Authorization: Bearer <RENDER_TOKEN>" -H "content-type: application/json" \
  -d '{"template":"animation","quality":"standard","variables":{"hook_keyword":"XIN CHÀO"}}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["jobId"])')
echo "jobId=$JOB"

# B2. Poll tới khi done (vài lần) — cần cùng Bearer token
curl -s http://76.13.223.45:8080/jobs/$JOB -H "Authorization: Bearer <RENDER_TOKEN>"
# → {"status":"queued"} → {"status":"rendering"} → {"status":"done","url":"https://...supabase.../...mp4","durationSec":18.5}
```

Mở `url` Supabase ra phải xem được MP4 (chữ tiếng Việt chuẩn). `storage` trong `/health` phải là `"supabase"` ở production.

---

## Vận hành & lưu ý

- **Async + poll**: `POST /render` → `202 {jobId}`; `GET /jobs/:jobId` → `{status, url?, error?, durationSec?}`. Job store **in-memory** (mất khi restart container — chấp nhận được giai đoạn này; job đang chạy sẽ phải gửi lại sau restart).
- **1 render tại 1 thời điểm**: service tự serialize (mutex). Job thứ 2 nằm `queued` chờ job 1 xong. 2 vCPU không render song song.
- **Timeout**: mỗi render tối đa 180s (đủ cho `high`).
- **Quality**: `draft` (nhanh, test) · `standard` (mặc định, app dùng) · `high` (giao hàng, ~2-3× lâu hơn).
- **broll `duration` + `voice_url`**: service "nướng" vào HTML tĩnh trước khi render (renderer đọc `data-duration` **và** `<audio src>` lúc compile — set bằng script là quá trễ → câm tiếng / sai độ dài).
- **URL phải public**: `voice_url` và `bg_urls` app truyền vào là URL công khai (Supabase) — service ở VPS tải qua mạng, KHÔNG thấy file local của app.
- **Logs**: `docker compose logs -f hf-render`. Token KHÔNG bao giờ bị log.
- **Cập nhật code**: `git pull && docker compose up -d --build`.
- **Kiểm môi trường**: `docker compose exec hf-render npx hyperframes@0.6.63 doctor` → Chrome + FFmpeg phải OK.

## Bảo mật (IP trần, chưa TLS)

- `RENDER_TOKEN` phải dài & ngẫu nhiên (≥32 ký tự). `/render` bắt buộc đúng token, sai → 401.
- Đường truyền HTTP chưa mã hoá — token chặn người lạ, đủ cho **test nội bộ**. Đừng gửi dữ liệu nhạy cảm ở giai đoạn này.

## Nâng cấp domain + HTTPS sau (KHÔNG làm bây giờ)

Khi có domain & sếp duyệt:
1. Trỏ A-record `render.tenmien.com` → `76.13.223.45`.
2. Trong `docker-compose.yml`: bỏ `ports: ["8080:8080"]`, đưa service vào cùng network với Traefik + thêm labels:
   ```yaml
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.hf.rule=Host(`render.tenmien.com`)"
     - "traefik.http.routers.hf.entrypoints=websecure"
     - "traefik.http.routers.hf.tls.certresolver=<resolver-cua-ban>"
     - "traefik.http.services.hf.loadbalancer.server.port=8080"
   ```
3. App chỉ việc đổi URL sang `https://render.tenmien.com`. Không phải sửa code service.
