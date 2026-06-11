# THIRD PARTY — Code & tài liệu vendor từ bên thứ ba

> Mọi thứ bê từ ngoài vào repo này PHẢI ghi ở đây: nguồn (URL + commit), license (SPDX),
> file đích, mức độ sửa đổi. Quy tắc: chỉ vendor Apache-2.0/MIT; giữ header attribution;
> KHÔNG bê asset không rõ bản quyền.

## 1. nexu-io/html-video

- **Nguồn:** https://github.com/nexu-io/html-video
- **License:** Apache-2.0 (SPDX: `Apache-2.0`) — toàn repo
- **Commit vendor:** `90a036a2f1ca1f91ccbffcf833f2e4ca8699f27b` (clone 2026-06-11)

| File đích trong repo này | Nguồn upstream | Sửa đổi |
|---|---|---|
| `src/lib/content-graph/index.ts` | `packages/content-graph/src/index.ts` | NGUYÊN VẸN + header provenance |
| `src/lib/sources/fetch-source.ts` | `packages/cli/src/fetch-source.ts` | Header provenance + **VÁ BẢO MẬT có ghi chú `[VideoSystem vá thêm]`**: validate từng hop redirect (manual ≤4) + chặn IP decimal/hex/rút gọn + IPv6 private (SSRF) |

**Tham khảo method (KHÔNG copy nguyên văn — sẽ ghi bổ sung nếu vendor thêm):**
- `packages/core/src/types/index.ts` — interface `EngineAdapter`/`RenderInput`/`RenderConfig`/`TemplateMetadata` (Phase 3 định nghĩa interface riêng soi theo đây).
- `packages/adapter-hyperframes/src/render.ts` — cách render Playwright + ffmpeg theo frame (Phase 3 nâng `hyperframes-service/server.mjs`).
- `templates/*/template.html-video.yaml` — format manifest template (Phase 2).
- `packages/adapter-hyperframes/src/render.ts` → method cho `hyperframes-service/lib/render-engine.mjs` (đổi chiến lược recordVideo→frame-stepping, viết lại).
- `packages/core/src/minimax.ts` → PORT pattern gọi API vào `src/lib/audio/minimax-music.ts` (music-1.5, base_resp check, hex decode) + chuẩn duck -18dB cho `/audio/mix`.

## 2. nexu-io/open-design

- **Nguồn:** https://github.com/nexu-io/open-design
- **License:** Apache-2.0 (SPDX: `Apache-2.0`) — toàn repo (vài skill MIT, không vendor skill nào đợt này)
- **Commit vendor:** `1eac8fcabf20bbc585b8140f1cb6b92bd86f5876` (clone 2026-06-11)

| File đích trong repo này | Nguồn upstream | Sửa đổi |
|---|---|---|
| `src/design/library/directions.ts` | `packages/contracts/src/prompts/directions.ts` | NGUYÊN VẸN + header provenance |
| `src/design/library/systems/<id>/DESIGN.md` (15 hệ¹) | `design-systems/<id>/DESIGN.md` | NGUYÊN VẸN |
| `src/design/library/systems/<id>/tokens.css` (15 hệ¹) | `design-systems/<id>/tokens.css` | NGUYÊN VẸN |
| `src/design/library/catalog.ts` | Sinh tự động từ 2 cột trên | Trích xuất palette/font (script `scripts/vendor-design-catalog.mjs`) |
| `src/design/library/critique.ts` | `apps/daemon/src/prompts/discovery.ts` (mục Step 8 + mục C) | CHƯNG CẤT method: rubric 5 chiều + blacklist AI-slop, dịch tiếng Việt + điều chỉnh cho video 9:16 |

¹ 15 hệ đã chọn (hợp tài chính/editorial/minimal): `stripe, revolut, wise, coinbase, binance,
mastercard, trading-terminal, editorial, warm-editorial, publication, linear-app, vercel,
premium, professional, theverge`.

> Lưu ý từ upstream open-design: các design system "inspired by" thương hiệu thật (Stripe,
> Binance…) — là TOKEN + mô tả phong cách do open-design tự viết, KHÔNG chứa asset gốc
> (logo/font độc quyền) của các hãng. Không dùng tên thương hiệu các hãng này trên video.

## 3. License gốc

Bản sao đầy đủ Apache License 2.0 của 2 repo trên: xem `licenses/html-video.LICENSE`
và `licenses/open-design.LICENSE` (copy nguyên văn từ upstream).
