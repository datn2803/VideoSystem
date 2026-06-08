# 🔒 Bảo mật — VideoSystem

> Cập nhật: 2026-06-08. Repo này TỪNG lộ key lên GitHub → tài liệu này để không tái diễn.

## 0) Trạng thái hiện tại (đã audit toàn bộ 91 commit)

| Hạng mục | Kết quả |
|---|---|
| Code HEAD (đang chạy) | ✅ Sạch — mọi key đọc từ `process.env`, không hardcode |
| `.gitignore` | ✅ Chặn `.env*`, `.mcp.json`, `*.pem/*.key`, service-account… |
| File `.env` thật bị commit | ✅ Chưa từng (chỉ `.env.example` placeholder) |
| Private key / service-account / mật khẩu VPS trong history | ✅ Không có |
| **Key lộ trong LỊCH SỬ git** | 🔴 **3 key** (xem mục 1) — phải revoke |

## 1) 🔴 VIỆC PHẢI LÀM NGAY — revoke 3 key đã lộ

Ba key này nằm trong lịch sử git (commit `c054d0d` trở về trước, `scripts/make-vu-video.mjs` dòng 14–16 + `scripts/v2-render-voices.mjs`). Code hiện tại đã gỡ, **nhưng lịch sử vẫn lưu** → coi như đã công khai, **bắt buộc thu hồi**:

| Provider | Vân tay (che giữa) | Việc làm |
|---|---|---|
| **DeepSeek** | `sk-fc…5942` | Vào https://platform.deepseek.com → API Keys → **Delete** key này → tạo key mới |
| **ElevenLabs** | `sk_5e…3c52` | Vào https://elevenlabs.io → Profile → API Keys → **Revoke** → tạo key mới |
| **HeyGen** | `sk_V2_…zwHb` | Vào https://app.heygen.com → Settings → API → **Revoke** → tạo key mới |

**Sau khi tạo key mới:** chỉ đặt ở **Vercel env** (Dashboard → Settings → Environment Variables) và `.env.local` của máy (đã .gitignore). **TUYỆT ĐỐI không** dán lại vào code.

> ⚠️ Chỉ anh (chủ tài khoản) làm được bước revoke này — Em (Claude) không có quyền và không được phép thao tác thu hồi/đổi credential.

## 2) Quy tắc vàng — KHÔNG BAO GIỜ hardcode secret

```js
// ❌ SAI — lộ ngay khi commit
const ELEVENLABS = "sk_5e...";
// ✅ ĐÚNG — đọc từ biến môi trường
const ELEVENLABS = process.env.ELEVENLABS_API_KEY;
```

Secret luôn sống ở: **Vercel env** (chạy thật) + **`.env.local`** (máy local, đã .gitignore) + **VPS env** (render). Không nơi nào khác.

### Phân tầng quyền — luôn dùng tầng THẤP NHẤT đủ việc
| Tầng | Key | Dùng cho | Rủi ro |
|---|---|---|---|
| 0 | (không cần) | Kiểm tra sống/deploy → `bash check.sh` | ~0 |
| 1 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Đọc data (RLS bảo vệ) | Thấp |
| 2 | `SUPABASE_SERVICE_ROLE_KEY`, `HUB_VAULT_KEY`, PAT | Ghi/admin | **Cao — hạn chế tối đa** |

## 3) Hàng rào tự động — pre-commit hook

Đã có `.githooks/pre-commit` tự quét secret trước mỗi commit và **chặn** nếu phát hiện.

**Bật (mỗi máy clone về chạy 1 lần — hoặc tự động khi `npm install`):**
```bash
git config core.hooksPath .githooks
```
- Bypass khẩn khi chắc chắn dương tính giả: `git commit --no-verify`
- Bắt: `sk-…`, `sk_…`, `sk-ant-…`, JWT `eyJ…`, AWS `AKIA…`, GitHub `ghp_…`, Google `AIza…`, private key block…

## 4) Cách kiểm tra dự án (không cần connector)

```bash
bash check.sh      # hoặc: npm run check
```
In ra: đang trỏ đúng Supabase/Vercel của dự án chưa (chống lộn project), Supabase sống chưa, app/Vercel sống chưa, 3 deploy gần nhất. **Không dùng secret nào.**

## 5) (Tùy chọn) Xoá key khỏi LỊCH SỬ git

Revoke (mục 1) là **bắt buộc và đủ** để vô hiệu key. Xoá khỏi history chỉ là vệ sinh thêm và **có rủi ro** (viết lại toàn bộ commit, phải force-push, hỏng bản clone của người khác). Nếu muốn làm, cân nhắc kỹ với cả team rồi dùng `git filter-repo` hoặc BFG. **Đừng tự chạy khi chưa thống nhất.**

## 6) Chống lộn account giữa 4 dự án

Mỗi dự án = 1 repo riêng, mang sẵn danh tính: `NEXT_PUBLIC_SUPABASE_URL` (Supabase nào) + `.vercel/project.json` (Vercel nào) + remote GitHub. Làm trong đúng folder repo → mọi lệnh tự trúng đúng account. `check.sh` đã so khớp `.env.local` với danh tính kỳ vọng để cảnh báo nếu lệch.
