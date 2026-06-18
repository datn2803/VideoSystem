# Chạy LOCAL trên Mac + Cloudflare Tunnel

Chạy render service bằng **Docker trên máy Mac** (thay vì VPS), expose ra Internet cho app Vercel
qua **Cloudflare Tunnel** — không mở port router/NAT. (Deploy VPS cũ vẫn dùng được: xem `DEPLOY.md`.)

## Yêu cầu
- **Docker** trên Mac: Docker Desktop (`brew install --cask docker`) hoặc colima (`brew install colima docker docker-compose` rồi `colima start`).
- **Cloudflare Tunnel token** (remote-managed): Cloudflare Zero Trust › **Networks › Tunnels** › *Create tunnel* (loại *Cloudflared*) → copy **token**. Ở tab *Public Hostname* thêm 1 hostname (vd `render.<domain>.com`) **trỏ về** `Service = http://hf-render:8080` (tên service trên compose network).

## Các bước
```bash
cd hyperframes-service
cp .env.example .env            # rồi điền .env (xem dưới) — .env ĐÃ gitignore, KHÔNG commit
docker compose up -d --build    # lần đầu lâu: tải 2 Chromium (playwright + hyperframes) + smoke render
```
Điền `.env`:
- `RENDER_TOKEN=` → `openssl rand -hex 32` (bearer cho POST /render).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET=videos` → **lấy đúng giá trị từ env app trên Vercel** (để app đọc được MP4; bucket `videos` phải tồn tại + public). Bỏ trống cả 3 → service phục vụ file qua `GET /files/:name` (chỉ test).
- `RENDER_ENGINE=playwright` → **BẮT BUỘC** cho b-roll `<video>` Pexels (C2 HYBRID). Để `cli` thì `<video>` đứng hình.
- `PEXELS_API_KEY=` → key free pexels.com/api (cho cảnh concept thành clip thật).
- `CLOUDFLARE_TUNNEL_TOKEN=` → token tunnel ở trên (compose tự đọc `.env` để nội suy).
- `SELF_PUBLIC_URL=` → chỉ điền khi KHÔNG dùng Supabase (đặt = URL public tunnel).

## Kiểm
```bash
curl -s http://localhost:8080/health        # → {"ok":true,"templates":[...],"storage":"supabase"|"file","mode":"async"}
docker compose logs -f cloudflared           # tìm "Registered tunnel connection" → tunnel đã lên
```
URL public = hostname đã đặt ở Cloudflare (vd `https://render.<domain>.com`). Kiểm ngoài:
`curl -s https://render.<domain>.com/health`.

## Trỏ app sang service (KHÔNG sửa code app — chỉ config)
Trong app: **Integration Hub → provider HyperFrames** → đặt **Service URL** = URL tunnel public,
**API Key** = `RENDER_TOKEN`. (App lưu ở `config.serviceUrl` — DB/Hub, không phải code.)

## Mac Apple Silicon (arm64)
Image build native arm64. **Nếu `docker compose build` fail ở bước smoke-render** (Chromium bundled của
`hyperframes@0.6.63` thiếu bản arm64) → thêm vào service `hf-render` trong `docker-compose.yml`:
```yaml
    platform: linux/amd64   # chạy qua emulation (Rosetta) — chậm hơn nhưng tương thích
```
rồi `docker compose build` lại. (FFmpeg + Playwright Chromium đều có arm64 → thường chỉ smoke-render CLI mới kén.)

## Lệnh quản lý
```bash
docker compose ps                 # trạng thái 2 container (hf-render, hf-tunnel)
docker compose logs -f hf-render  # log render
docker compose down               # dừng
docker compose up -d --build      # build lại sau khi đổi code/Dockerfile
```
