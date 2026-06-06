# HANDOFF — VideoSystem (dời sang Claude Code)

> Tài liệu bàn giao toàn bộ bối cảnh dự án + những gì đã làm, để Claude Code (hoặc agent mới) tiếp tục mà không mất context. Đọc hết trước khi code.

---

# 🔄 PHIÊN MỚI NHẤT (Jun 2026) — ĐỌC ĐẦU TIÊN

## A. ĐÃ SHIP phiên này (C3 animation + audio) — đã lên `main`
Commits trên main: `da7005f → 39f0f74 → ae0642a → de8c74a → 097ce44`.
- **C3 đại tu GU + chiều sâu (LIVE trên VPS, video xác nhận đẹp):** thẻ bento có **depth** (hệ elevation 2 lớp `--elev-1/2` + sheen kính thẻ gradient); **donut/trend gradient** (accent2→accent, set stop bằng JS); **bỏ lặp nhãn** (eyebrow = tag ngắn "TỈ LỆ/XU HƯỚNG/SỐ LIỆU", caption đầy đủ ở dưới); **bignum/donut/trend bọc trong bento-host** (lấp khung, hết trôi nền trơ); **point = 2-tile bento** (tile số gradient/tint + tile chữ + glyph); **before→after** thẻ cao 3 hàng (nhãn·số·thanh tỉ lệ), đơn vị `.bu` nhỏ; **mini/pills** lưới 1fr lấp đều; **fix số tràn** (FT đo GIÁ TRỊ CUỐI + re-fit `document.fonts.ready`); **s_emph** thẻ nguyên tắc hero lớn; **s_cmp** divider + khối căn giữa. File: `hyperframes-service/compositions/animation.html`. → **ĐÃ scp + rebuild VPS → LIVE.**
- **Fix audio voice méo/rè đoạn cuối (0:51→hết):** gốc = ElevenLabs đọc 1 LẦN text dài (~1200 ký tự) bị xuống chất nửa sau. Fix: **chunk câu ≤400 ký tự + `previous_text`/`next_text` giữ ngữ điệu + nối** trong `src/lib/integration-hub/adapters/elevenlabs.ts` (có fallback đọc-1-lần nếu chunk lỗi). Commit `097ce44`, push main → Vercel auto-deploy. ⏳ **CHƯA verify** — Tommy re-gen 1 video mới để nghe lại đoạn cuối.

## B. ĐANG PHÂN TÍCH (CHƯA CODE) — VIỆC TIẾP THEO CHÍNH
Nâng cấp **"bộ não nội dung" Profile → Plan → Script** để chủ đề + số liệu **THẬT, real-time, chuyên nghiệp** (hiện Gemini KHÔNG grounding → chủ đề/số chỉ từ trí nhớ model, không real-time).
👉 **Đã viết BLUEPRINT đầy đủ: `BLUEPRINT_CONTENT_ENGINE.md` (đọc file đó).**
**Quyết định ĐÃ CHỐT với Tommy:**
- Research engine = **Gemini Google Search grounding** (1500 lượt/ngày free). Model = **Gemini 2.5 Flash**.
- ⚠ Gemini 2.5: **grounding KHÔNG đi chung JSON** → mỗi tầng tách **Researcher (grounded → TEXT có nguồn) → Writer (JSON)**.
- **Content pillars**: Agent tự suy ra **4 trụ** từ profile + Tommy sửa được (automation + override).
- Chủ đề: bám **nỗi đau khách + trend**, **~70% evergreen / 30% trend** (bền vững > viral nhanh), dễ tiếp cận mọi tệp, **chấm điểm** demand×virality×relevance.
- Script: khung **Hook→Vấn đề→Giải pháp→Bằng chứng(số thật)→CTA**, **≤90s** (khoá **word-budget ~200-230 từ**), chống bịa (chỉ dùng số trong brief + lưu `sources`).
**Thứ tự code (làm lần lượt, nghiệm thu từng phần):**
1. **Adapter Gemini thêm grounding** (`google_search` tool; grounded→TEXT+citations, không set JSON) — nền tảng.
2. **Part 1 — Profile + Strategy Agent** (sinh pillars) — `createProfileAction` + `ProfileRecord.strategy` + UI sửa pillars.
3. **Part 2 — Planner**: Trend Researcher (grounded) + Topic Strategist (chấm điểm) — nâng `planner.ts` + `ContentTopic`.
4. **Part 3 — Scripter**: Fact Researcher (grounded) + Writer (word-budget) + Editor — nâng `scripter.ts` + `auditor.ts`.

## C. GIT / ĐƯỜNG DẪN — ⚠ LÀM ĐÚNG KẺO TOANG
- Repo chính: `/Users/tommy/Desktop/VideoSystem-claude-video-content-automation-PYlvQ/VideoSystem-claude-video-content-automation-PYlvQ/`.
- **NGUỒN CHÂN LÝ DUY NHẤT = GitHub branch `main`** (đủ mọi commit phiên này tới `bd5cde5`).
- 🔴 **CỰC KỲ QUAN TRỌNG — làm ĐẦU TIÊN:** thư mục chính đang ở branch `Tommy` **TỤT NHIỀU commit (≥17)** sau `origin/main` → THIẾU file (vd `src/lib/audio/whisper.ts`, mà `c2-broll.ts` import) → **`npm run build` sẽ VỠ** nếu code trên trạng thái này. Phải đồng bộ trước:
  ```bash
  cd "<repo chính>"
  git fetch origin
  git reset --hard origin/main      # working copy = main mới nhất (bỏ thay đổi rác cũ; an toàn vì mọi thứ quan trọng đã ở main)
  # nếu git báo untracked sẽ bị ghi đè (vd HANDOFF/BLUEPRINT): xoá file đó rồi reset lại — nội dung y hệt đã có trên main.
  npm install                        # deps khớp
  npx tsc --noEmit                   # PHẢI pass rồi mới code tiếp
  ```
- **Push (mọi branch đều dùng được):** `git push origin HEAD:main`. (Các chỗ ghi `Tommy:main` bên dưới là tương đương SAU khi đã reset về main.)
- ⚠ `animation.html` (file render C3) từng nằm 3 nơi: worktree cũ · repo chính · mirror `~/Desktop/hyperframes-service`. **Tommy scp từ REPO CHÍNH.** → Mỗi khi sửa file dùng để render, sau khi push main, **đảm bảo file ở repo chính = bản mới** (sau `git reset --hard origin/main` là khớp) RỒI mới nhắc Tommy scp. **Bug đã gặp:** scp nhầm file CŨ → render ra design cũ.
- (Git worktree `.claude/worktrees/epic-ride-dab9d7` là của phiên cũ — phiên mới KHÔNG cần, cứ làm thẳng repo chính sau khi reset về main.)

## D. FILE MAP cho VIỆC TIẾP THEO (content engine) + cách verify
**File sẽ đụng khi làm bộ não nội dung (đều có thật trên `main`):**
- `src/lib/integration-hub/adapters/gemini.ts` — adapter LLM; **thêm grounding `google_search` ở đây** (grounded→TEXT, KHÔNG set responseMimeType JSON; nhớ giữ `thinkingConfig.thinkingBudget:0` cho 2.5).
- `src/lib/integration-hub/storage.ts` — type `ProfileRecord` (thêm `strategy`/pillars) + `recordUsage`.
- `src/lib/profiles/actions.ts` — `createProfileAction` (móc Strategy Agent sinh pillars).
- `src/lib/agents/planner.ts` — `generateContentPlan` + type `ContentTopic` (nâng: Trend Researcher grounded + Topic Strategist chấm điểm).
- `src/lib/projects/{storage,actions}.ts` — ProjectRecord (topics + scriptIds), `createProjectWithPlanAction`.
- `src/lib/agents/scripter.ts` — `generateScript` (tách Fact Researcher grounded + Writer word-budget).
- `src/lib/agents/auditor.ts` — `auditScript` (nâng thành Editor: chấm hook/data/độ dài).
- UI: `src/components/profiles/create-profile-dialog.tsx`, `src/components/projects/*`, `src/components/projects/project-topics.tsx` (chọn chủ đề → sinh script).

**Model thực tế:** model LLM do **config Integration Hub (Supabase) quyết định** — hiện có thể là `gemini-2.5-flash-lite`. Blueprint khuyến nghị đổi khâu script sang `gemini-2.5-flash` (đổi qua config provider, không hardcode).

**Cách VERIFY C3 nhanh (KHÔNG cần render VPS 10 phút) — kỹ thuật đã dùng hiệu quả phiên này:**
- Có Chrome trên máy: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Copy `hyperframes-service/compositions/animation.html` ra file tạm, chèn TRƯỚC `<script>` chính một thẻ `<script>` định nghĩa `window.__hyperframes={getVariables:()=>({...biến mẫu...})}`; chèn SAU cùng 1 script: đợi `document.fonts.ready` → **chạy timeline từng frame** `var tl=window.__timelines.main; for(t=0;t<target;t+=1/30) tl.time(t,false)` (để count-up onUpdate chạy đúng — seek 1 phát sẽ KHÔNG cập nhật số) → đặt `data-start/data-duration` đã set sẵn để biết mốc cảnh.
- Chụp: `chrome --headless=new --window-size=1080,1920 --force-device-scale-factor=1 --virtual-time-budget=4500 --screenshot=out.png "file://.../tmp.html?scene=s_donut&frac=0.85"`. Đọc PNG để soi layout/màu. Cũng dùng `--dump-dom` để assert giá trị số + cờ tràn (scrollWidth>clientWidth).
- Đây là cách bắt lỗi layout/clip TRƯỚC khi tốn render thật.

**Tài liệu khác ở gốc repo:** `PRD.md` (spec gốc — tham khảo kiến trúc/module), `BLUEPRINT_CONTENT_ENGINE.md` (thiết kế việc tiếp theo), `MASTER_PLAN.md`.

**Memory (đường dẫn CHÍNH XÁC trên máy này):**
`/Users/tommy/.claude/projects/-Users-tommy-Desktop-VideoSystem-claude-video-content-automation-PYlvQ-VideoSystem-claude-video-content-automation-PYlvQ/memory/`
→ gồm `MEMORY.md`, `hyperframes-render-service.md` (kiến trúc render C2/C3 + C3 v5 read-script model + levers tốc độ), `leaked-keys-to-revoke.md` (⚠ **BẢO MẬT — việc cần làm:** key DeepSeek/ElevenLabs/HeyGen từng lộ public trên GitHub; code đã sửa nhưng lịch sử git vẫn lộ → Tommy nên **revoke + đổi key**). (Cùng máy → mọi tài khoản Claude Code đọc được; nếu không thấy thì HANDOFF này đã đủ context.)

---

# 🚀 GIAO THỨC RESUME (Tommy paste nguyên khối này vào Claude Code phiên/tài khoản mới)

```
Tôi đang tiếp tục dự án VideoSystem (Next.js — app tự sinh video short-form tiếng Việt
cho TikTok/Reels; 3 concept C1 HeyGen / C2 b-roll / C3 animation; render qua HyperFrames trên VPS).

BƯỚC ĐẦU TIÊN BẮT BUỘC (làm trước khi code bất cứ gì):
0) ĐỒNG BỘ GIT (repo chính đang tụt sau main, thiếu file → build vỡ nếu bỏ qua):
   cd "/Users/tommy/Desktop/VideoSystem-claude-video-content-automation-PYlvQ/VideoSystem-claude-video-content-automation-PYlvQ"
   git fetch origin && git reset --hard origin/main && npm install && npx tsc --noEmit
1) Đọc HẾT 2 file ở gốc repo: HANDOFF_VIDEOSYSTEM.md và BLUEPRINT_CONTENT_ENGINE.md
2) Đọc memory tại:
   /Users/tommy/.claude/projects/-Users-tommy-Desktop-VideoSystem-claude-video-content-automation-PYlvQ-VideoSystem-claude-video-content-automation-PYlvQ/memory/
   (MEMORY.md + hyperframes-render-service.md)
3) Tóm tắt lại cho tôi: (a) trạng thái hiện tại, (b) việc tiếp theo, (c) các quyết định đã chốt
   — để tôi xác nhận bạn đã hiểu đúng TRƯỚC khi bắt tay.

QUY TẮC CỨNG:
- Trả lời tiếng Việt. Web search/research BẮT BUỘC dùng exa MCP (nếu tài khoản/máy mới chưa cài exa MCP → cài trước, hoặc tạm dùng web search built-in).
- KHÔNG bịa số liệu. Đọc code trên đĩa để verify (không tin báo cáo suông). tsc + build phải pass trước khi push.
- Deploy app: git push origin HEAD:main (Vercel auto-build). File VPS (hyperframes-service/*): phải scp +
  'docker compose up -d --build' (tôi chạy SSH; trước khi scp nhớ đồng bộ file về repo chính).
- Làm TỪNG PHẦN, nghiệm thu từng phần; đổi lớn thì hỏi tôi trước.

VIỆC TIẾP THEO (đã chốt hướng — chi tiết trong BLUEPRINT_CONTENT_ENGINE.md):
Nâng cấp bộ não nội dung Profile→Plan→Script. Research engine = Gemini Google Search grounding;
model Gemini 2.5 Flash; kiến trúc 2 bước Researcher(grounded→TEXT)→Writer(JSON) (vì 2.5 không gộp
grounding+JSON); content pillars Agent tự suy 4 trụ (tôi sửa được); 70/30 evergreen/trend; chủ đề
chấm điểm; script ≤90s (word-budget ~200-230 từ); chống bịa + lưu nguồn.
Code theo thứ tự: (1) adapter Gemini thêm grounding → (2) Part1 Profile+Strategy Agent →
(3) Part2 Planner(Trend Researcher+Topic Strategist) → (4) Part3 Scripter(Fact Researcher+Writer+Editor).

Hãy đọc 2 file + memory, tóm tắt + xác nhận hiểu, rồi đề xuất bắt đầu (1) adapter grounding + Part1.
```

---

## 1. Dự án là gì
**VideoSystem** — app Next.js/TypeScript tự động sinh video short-form (dọc 9:16, tiếng Việt) cho TikTok/Reels, 3 concept mỗi script:
- **C1 Talking Head** — avatar HeyGen, đọc theo audio TTS (lip-sync theo file audio).
- **C2 B-roll** — voice-over + ảnh AI (gpt-image) + caption karaoke, render qua HyperFrames.
- **C3 Animation** — motion-graphics/explainer, render qua HyperFrames.

Pipeline 1 script: Planner → Scripter (LLM sinh script + 3 variant) → Auditor → Voice Studio (TTS) → Render Studio (C1/C2/C3) → Review → Export.

## 2. Hạ tầng + deploy (CỰC KỲ QUAN TRỌNG — nhớ kỹ)
- **App** chạy trên **Vercel** (serverless, **server action cap 60s**). Repo GitHub `datn2803/VideoSystem`. Branch làm việc local = `Tommy`, push: **`git push origin Tommy:main`** → Vercel auto-build.
  - Production domain hiện dùng: **`video-system-five.vercel.app`** (branch main). Có domain cũ `video-system-murex...` từng bị lag alias.
  - ⚠ **Production alias hay lag**: sau push, nếu render ra code cũ → vào Vercel → Deployments → **Promote to Production** deployment mới nhất.
- **Render service "HyperFrames"** = self-host trên **VPS Hostinger** `root@76.13.223.45`, dir `~/hyperframes-service`, Docker (`docker compose`), container `hf-render`, cổng 8080.
  - VPS: **KVM2, 2 vCPU, 8GB RAM, Ubuntu 24.04, KHÔNG GPU** → Chromium render **phần mềm (SwiftShader)**.
  - HyperFrames pin version **0.6.63**.
- **⚠ QUY TẮC DEPLOY VÀNG:** `git push` CHỈ cập nhật app trên Vercel. File chạy trên VPS (`hyperframes-service/server.mjs`, `compositions/*.html`, `lib/*`) **KHÔNG tự lên VPS** → phải **scp + `docker compose up -d --build`** thủ công (cần SSH/mật khẩu VPS của Tommy). Lệnh mẫu:
  ```bash
  scp "<repo>/hyperframes-service/compositions/animation.html" root@76.13.223.45:~/hyperframes-service/compositions/animation.html
  ssh root@76.13.223.45 'cd ~/hyperframes-service && docker compose up -d --build'
  ```
- **Supabase**: storage cho audio/video/ảnh (bucket `videos`, `broll-images`). Service render upload kết quả lên đây, trả public URL.
- **Quy trình làm việc Tommy muốn:** code xong + verify (tsc/build) → **commit & push thẳng `origin Tommy:main`**, Tommy test trực tiếp production. KHÔNG local/preview, KHÔNG chờ duyệt. (File VPS thì vẫn phải scp + rebuild.)

## 3. Providers / API keys (Integration Hub, lưu Supabase mã hoá)
- **LLM**: Google **Gemini** (gemini-2.5-flash) — default. ⚠ **Gemini 2.5 trả JSON rỗng nếu không set `thinkingBudget:0`**. Quota từng 429 (đã/có thể hết).
- **TTS**: **ElevenLabs ONLY** (đã bỏ hẳn FPT TTS). Model `eleven_turbo_v2_5` (hỗ trợ tiếng Việt + ép language_code).
- **Image**: **OpenAI GPT Image**. Tommy cấu hình model **`gpt-image-2`** (đã trả phí, key hợp lệ).
- **Avatar (C1)**: HeyGen (trả phí, từng "Insufficient credit").
- **Render**: HyperFrames (VPS).

## 4. ⚠ GOTCHA HẠ TẦNG đã phát hiện (đừng lặp lại sai lầm)
1. **VPS KHÔNG gọi được OpenAI** (`api.openai.com`): DNS/TCP ok nhưng Cloudflare edge của OpenAI **chặn IP datacenter VPS** → timeout/520. ⟹ **Sinh ảnh phải làm trên Vercel** (Vercel gọi OpenAI bình thường) → upload Supabase → truyền URL sang VPS render. KHÔNG gọi OpenAI từ VPS.
2. **`gpt-image-2` KHÔNG hỗ trợ `background:"transparent"`** (lỗi "Transparent background is not supported for this model"). ⟹ Adapter `openai-image.ts` **tự ép `gpt-image-1`** khi cần ảnh nền trong (cutout); giữ gpt-image-2 cho ảnh opaque (C2). Đây là fix đang chạy.
3. **Gemini 429 quota** → vision-QC fallback pass-through (score 10). Cần key có quota để QC chấm thật.
4. **Render C3 chậm (~10-20 phút)** — KHÔNG phải thiếu phần cứng (CPU lúc render chỉ ~4%, máy rảnh). Nguyên nhân: (a) HyperFrames mặc định **1 worker trên 2-core VM** → render đơn luồng; (b) **vision-QC render 2 vòng** vì ngưỡng score≥8 quá khắt (layout 7.x luôn trượt → render lại vô ích). ⟹ Fix tốc độ (đang áp): `--workers 2`, `--fps 24`, `--quality draft` (cả broll+animation), QC chỉ re-render khi score <6. (Các cờ này ĐÃ verify hợp lệ trong CLI 0.6.63.)
5. **Sandbox của agent này KHÔNG push git được** (không có GitHub auth + lock) → Claude Code phải tự commit & push. **scp VPS cần Tommy chạy** (mật khẩu SSH).

## 5. (LỊCH SỬ phiên TRƯỚC — đã xong, chỉ để tham khảo bối cảnh) Các commit nền tảng
- **Phase 1** (`59c0659`): Bỏ HẲN FPT TTS, chỉ ElevenLabs; thêm `voice_settings.speed`.
- **Phase 1.5** (`c43da7b`): Slider tốc độ giọng 1.0–2.0. ElevenLabs native cap 1.2; phần vượt dùng **ffmpeg `atempo` trên VPS** (endpoint `POST /audio/speed`). Giữ cao độ. Default speed 1.5 lưu Integration Hub.
- **Fix C1 Re-render** (`1d4871a`): cache `hashRender` cũ dùng `voiceId` → đổi tốc độ (audio mới) vẫn trả video cũ. Sửa: hash theo `audio.id` + nút Re-render `force=true` bỏ cache.
- **Cleanup** (`df0d3d0`): gỡ dead code đã verify (imports/exports/deps thừa `@supabase/ssr`,`zod`). **TIER 3 GIỮ LẠI** (chủ ý, đừng gỡ): `deleteScriptAction`, `listProjectsAction`, `getProjectAction` (feature chưa nối UI).
- **Phase 2 — C3 Animation** (nhiều commit, mới nhất `0f31beb`):
  - v3 (`c43da7b…76e2ff4`): redesign **Light Bento** (nền sáng pastel, thẻ bento, nhân vật 3D gpt-image transparent, vision-QC). Bỏ caption (Tommy không muốn sub).
  - Fix ảnh: sinh ảnh transparent trên **Vercel** (gpt-image-1) → Supabase URL → VPS (vì VPS bị OpenAI chặn).
  - v3.1: timeline **tile lấp đầy** (scene ẩn không để gap), count-up snappy khớp giọng.
  - v4 (`f7afb73`): bố cục bám mẫu donniechublog — canh trái, eyebrow icon-pill, headline accent, archetype bento (bignum/pbar/pill2/herocard 3D).
  - Speed (`b350df1`): `--workers 2 --fps 24 --quality draft` + QC re-render chỉ khi <6.
  - **Scripter enrich** (`0f31beb` — MỚI NHẤT): mở rộng `scripter.ts` schema `animation` thêm `heroSubject/bigStat/bars/pills/compare/principle/callout`; map ở `c3-animation.ts`; wire 2 scene mới `s_emph`(callout+principle) + `s_cmp`(compare 2-cột) trong `animation.html`; fix empty-space (`.scene.left{justify-content:center}`). Backward-compat + anti-fab.

## 6. (LỊCH SỬ — ĐÃ XONG, KHÔNG còn là việc cần làm) Trạng thái phiên trước
> ⚠ Mục này đã bị **THAY THẾ bởi block A ở đầu file**. animation.html đã scp + LIVE, nhiều script đã gen. ĐỪNG làm lại các gạch đầu dòng dưới — chỉ để hiểu lịch sử.
- (cũ) Commit `0f31beb` cần scp animation.html + gen script mới + kiểm 6 archetype donniechublog. → Tất cả đã xong + đã đại tu thêm ở phiên này (xem block A).

## 7. Mục tiêu C3 (style đích)
Bám phong cách **@donniechublog** (6 ảnh mẫu Tommy gửi): **Light Bento** — nền sáng lavender/cream, thẻ bo góc 20-28px + shadow mềm, typography đậm phân cấp (near-black + accent tím `#7c3aed`), **nhân vật 3D cartoon** (Pixar/Blender, gpt-image-1 transparent), eyebrow icon-pill, progress bar, 2-cột so sánh, callout bar, gradient card, canh trái là chính (hero/CTA canh giữa). KHÔNG caption sub. KHÔNG bịa số (anti-fabrication). KHÔNG copy watermark donniechublog.
Giới hạn tự động hoá đã thống nhất với Tommy: khớp **kiểu bố cục + thẩm mỹ ~90%**, nội dung từng ô từ script (không phải đúng chữ trong mẫu); 3D Blender 1:1 và diagram node-graph (frame 3) là phần khó — diagram thiếu data thì thay list card, không vẽ bịa.

## 8. File chính
- `src/lib/agents/scripter.ts` — sinh script (đã enrich schema animation).
- `src/lib/video/builders/c3-animation.ts` — build biến cho composition animation + sinh ảnh hero trên Vercel.
- `src/lib/video/builders/c1-talking.ts`, `c2-broll.ts` — C1/C2.
- `src/lib/audio/voice-agent.ts`, `speed-service.ts` — TTS + atempo qua VPS.
- `src/lib/integration-hub/adapters/openai-image.ts` — gpt-image (ép gpt-image-1 khi transparent).
- `hyperframes-service/server.mjs` — render service VPS (renderTemplate + renderAnimationWithQC + /audio/speed + vision-QC).
- `hyperframes-service/lib/vision.mjs` — Gemini vision QC.
- `hyperframes-service/compositions/animation.html` — composition C3 (Light Bento v4 + scripter-enrich).
- Các prompt đã viết (root repo, gitignored): `CLAUDE_CODE_*.md` — lịch sử từng bước.

## 9. Tcommands hữu ích
```bash
# Verify app
npx tsc --noEmit && npm run build
# Deploy app
git push origin Tommy:main
# Deploy VPS (sau khi đổi server.mjs / compositions / lib)
scp <file> root@76.13.223.45:~/hyperframes-service/<path> && \
ssh root@76.13.223.45 'cd ~/hyperframes-service && docker compose up -d --build'
# Log render VPS
ssh root@76.13.223.45 'cd ~/hyperframes-service && docker compose logs --tail=60'
# Verify VPS đã nhận file mới
ssh root@76.13.223.45 'grep -c "<chuỗi mới>" ~/hyperframes-service/compositions/animation.html'
```

## 10. Quy tắc làm việc (Tommy)
- Mỗi thay đổi code: **commit & push luôn** (Tommy test production). File VPS: nhắc scp + rebuild.
- **Double-check kỹ** sau mỗi bước (đọc code trên đĩa, không tin báo cáo suông): tsc, contract biến builder↔composition, anti-fab, no-gap timeline, không đụng concept khác.
- **Anti-fabrication tuyệt đối**: không bịa số liệu; scene/thẻ thiếu data thì tự ẩn.
- Đụng lỗi API ngoài → **lấy nguyên văn response trước** (curl/log), đừng suy diễn.
- Ngôn ngữ: tiếng Việt.
