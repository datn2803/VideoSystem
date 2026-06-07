# HANDOFF — VideoSystem (dời sang Claude Code)

> Tài liệu bàn giao toàn bộ bối cảnh dự án + những gì đã làm, để Claude Code (hoặc agent mới) tiếp tục mà không mất context. Đọc hết trước khi code.

---

# 🔄 TRẠNG THÁI HIỆN TẠI — ĐỌC ĐẦU TIÊN (cập nhật: phiên C3 v2 dark/caption/flow, Jun 2026)

> ⚠ FILE NÀY LÀ TÀI LIỆU TIẾN ĐỘ **SỐNG** — luôn cập nhật phần "ĐANG LÀM ĐẾN ĐÂU" mỗi khi xong 1 mốc,
> để nếu phiên chat bị ngắt thì phiên sau resume được NGAY (xem GIAO THỨC RESUME cuối phần này).

## ⚡ TL;DR — ĐANG LÀM ĐẾN ĐÂU (checklist sống)
- ✅ **C3 v2 — đại tu thẩm mỹ animation** (commit `7882035`·`2eae374`·`a9766c7` trên `main`, đã verify RENDER THẬT VPS): **theme dark/bright theo industry** (tài chính→dark), **icon glow**, **caption karaoke sync read-script**, **sơ đồ flow** (pills+mũi tên), **bỏ nhân vật 3D** (tiết kiệm gpt-image+nhanh), **ưu tiên số thật vào viz** (khi bật billing). **Thiết kế: `BLUEPRINT_C3_V2.md`.**
- 🔥 **C3 Round 2 — làm giàu DATA + chiều sâu** (ĐÃ push `916352d` deploy READY · scripter VERIFY LIVE): **point scenes = THẺ HƯỚNG DẪN giàu data** (tiêu đề bước + cách làm/DẠY + thẻ số liệu, **2 thẻ xếp lớp + watermark số → chiều sâu**), **mini-stat hết hở giữa** (căn giữa), **CTA mũi tên**, **wiring scripter+builder** sinh `animation.points:[{title,detail,stat}]` (fallback keyMessages, `text=title` backward-compat). ✅ **VERIFY TRỌN VẸN trên VIDEO THẬT**: gen script `f9ed585c` (grounded 8 nguồn) → Tommy scp composition + rebuild → re-render video 60s thật: **3 point cards giàu + chiều sâu hiện đúng** (dark theme, CTA mũi tên). Đã polish bố cục (commit `eb3ef6c`: thẻ to + căn giữa khung + số mờ nền) — verify before/after trên video thật OK. Render C3 = **$0** (self-host). XONG. Chi tiết: `BLUEPRINT_C3_V2.md` mục 8 (R2.1–R2.8).
- ✅ **Bộ não nội dung (Profile→Plan→Script)**: ĐÃ CODE XONG cả 4 phần, trên `main` (7 commit `59e7412…3cbc901`). Đã tự test headless trên production → CHẠY THẬT (xem mục A).
- ✅ **Bug scripter (parse JSON vỡ → script rác)**: ĐÃ FIX (`70d2eb0`) + **ĐÃ VERIFY LIVE** (deploy `16b08e7` READY): gen 2 script mới đều SẠCH (hook/body/cta + C3 keyMessages/dataPoints đầy đủ; Writer dùng nháy đơn `'..'` đúng prompt → hết vỡ JSON). Word-budget ~151–193 từ (≤90s OK; auditor flag nếu quá). Mục B.
- ⚠ **Gemini 429 hết quota free-tier** (gen nhiều lần test → cạn): lỗi được xử lý graceful (message rõ, không tạo rác). Reset theo phút/ngày — HOẶC bật billing (mục C) để hết lo quota + có grounding.
- ✅ **Billing Gemini HÌNH NHƯ ĐÃ BẬT** (cập nhật 07/06): gen script live `f9ed585c` → grounding trả **8 nguồn THẬT** (vneconomy/tuoitre/vietnamnet…) + số 2024 cụ thể → fact brief & số liệu giờ là GROUNDED, không còn từ trí nhớ. (Trước đây no-op — xem memory `gemini-grounding-needs-billing`. Nếu sau này thấy `0 nguồn` lại → billing có thể đã hết hạn.)
- ⏳ **Audio méo cuối** (commit `097ce44`): vẫn CHƯA verify nghe lại.
- ⚠ **Bảo mật**: key DeepSeek/ElevenLabs/HeyGen từng lộ public trên GitHub → Tommy cần **revoke + đổi key** (xem memory `leaked-keys-to-revoke.md`).

## A. Bộ não nội dung — ĐÃ XONG (7 commit trên `main`, KHÔNG còn là "việc tiếp theo")
> ⚠ Bản HANDOFF cũ ghi đây là "ĐANG PHÂN TÍCH (CHƯA CODE)" — ĐÓ LÀ CŨ/SAI. Phiên trước đã code xong
> hết RỒI mới bị ngắt trước khi kịp cập nhật. ĐỪNG làm lại. Thiết kế gốc: `BLUEPRINT_CONTENT_ENGINE.md`.
Theo đúng thứ tự Blueprint, đã ship lên `main`:
1. `59e7412` — Adapter Gemini + Google Search **grounding** (grounded→TEXT+citations; KHÔNG set JSON; grounded thì GIỮ thinking).
2. `72547ca`+`ae0345b` — **Part 1 Strategy Agent**: profile → brandAngle+channelGoal+**4 pillars** (sửa/regenerate được). `strategist.ts` + `strategist-parse.ts` + `profile-strategy.tsx`.
3. `e7ad03b`+`3142435` — **Part 2 Planner**: Trend Researcher (grounded) + Topic Strategist (**chấm điểm** demand×virality×relevance, **70/30** evergreen/trend), lưu+hiện trend brief & nguồn. `planner.ts` + `planner-parse.ts`.
4. `3bb7b24` — vá grounding: `thinkingBudget:0` chặn google_search nên grounded GIỮ thinking + thêm **cảnh báo no-source** (anti-fab).
5. `3cbc901` — **Part 3 Scripter**: Fact Researcher (grounded) + Writer (word-budget) + Editor (`auditor.ts` chấm hook/data/độ dài). `scripter.ts`.
**Quyết định đã chốt (vẫn hiệu lực):** grounding=Gemini Google Search · kiến trúc 2 bước Researcher(grounded→TEXT)→Writer(JSON) · 4 trụ tự suy (sửa được) · 70/30 evergreen/trend · chấm điểm · script ≤90s khoá word-budget · chống bịa + lưu nguồn.

## B. BUG ĐÃ TÌM + FIX phiên này — Scripter parse JSON vỡ (commit `70d2eb0`)
**Triệu chứng** (tự test headless trên production): bug **INTERMITTENT** — trong 3 script pre-fix, **1 cái
(972b9fb8) bị RÁC**: hook/cta rỗng, body = JSON thô (`thought{...}`) 1020 từ, **C3 schema rỗng**, NHƯNG audit
vẫn PASS 100/100 (chấm nhầm rác). 2 cái kia (2b7eb4ca, 32cc49ca) thực ra parse OK. (Đã re-verify bằng đọc DOM
chính xác — probe đọc-text đầu tiên của tôi từng báo nhầm 2 cái kia thành rỗng; bài học: extract `innerText`
split-theo-label không đáng tin, phải đọc đúng `.whitespace-pre-wrap` của từng Section.)
**Gốc rễ:** model `gemini-2.5-flash-lite` (1) rò "thinking part" ra TRƯỚC JSON, (2) chèn dấu `"`
không-escape trong chuỗi tiếng Việt → `JSON.parse` vỡ → `generateScript` rơi fallback **ĐỔ RAW vào body**.
Scripter lại KHÔNG có retry (trong khi planner/strategist đều có).
**Fix (`70d2eb0`):**
- `gemini.ts`: bỏ part `thought:true` khi ghép text (model-agnostic, an toàn cả nhánh grounded).
- `scripter.ts`: thêm `parseScriptJson` (bóc fence + cắt thừa trước `{`/sau `}` + vá trailing comma) +
  **RETRY 1 lần** + fallback **AN TOÀN** (throw lỗi rõ, KHÔNG đổ raw vào body) + prompt cấm dùng `"` trong chuỗi.
- Đã `tsc` + `npm run build` PASS + sanity-test `parseScriptJson` (9 case logic chuẩn).
**✅ ĐÃ VERIFY LIVE** (deploy `16b08e7`): gen 2 script mới (e8da57c3, 91bfeef1) đều SẠCH — body văn xuôi (không JSON thô),
hook/cta có nội dung, C3 keyMessages 4–10 + dataPoints (ghi rõ "Ví dụ" — anti-fab), audit PASS 90; READ 151–193 từ.
Writer dùng nháy đơn `'..'` đúng prompt mới. (Script thứ 3 bị Gemini 429 chặn — quota, không phải bug.)
Re-verify TOÀN project (đọc DOM chính xác): **4/5 script SẠCH**; chỉ `972b9fb8` (pre-fix) còn rác → nên xoá/gen lại. Đã gỡ dead-code field `raw` của ScriptResult.
**Cải thiện TÙY CHỌN còn lại:** (1) flash-lite thi thoảng vẫn có thể yếu → cân nhắc đổi model LLM sang **`gemini-2.5-flash`**
(Settings→Integrations; Blueprint khuyến nghị cho khâu script). (2) Word-budget có lúc 193>150 (vẫn ≤90s) — siết prompt nếu muốn sát 60s.

## C. BILLING GEMINI — CHƯA BẬT (đã xác nhận BẰNG THỰC NGHIỆM) ⚠
Grounding (`google_search`) là **no-op âm thầm** trên free tier → Trend/Fact Researcher trả **0 nguồn**,
nội dung từ trí nhớ model (KHÔNG real-time). Production hiện cho thấy "Nghiên cứu xu hướng (grounded) — 0 nguồn"
+ dòng cảnh báo "⚠ KHÔNG có nguồn real-time…" hiện ĐÚNG (anti-fab OK, không lừa người dùng). Engine chạy graceful.
👉 **Muốn số liệu THẬT real-time như mục tiêu Blueprint: Tommy phải BẬT BILLING trả phí cho Gemini key**
(sau khi bật có 1500 lượt grounding/ngày free). **Code đã đúng — bật billing là chạy ngay, không cần sửa code.**

## C2. (lịch sử) ĐÃ SHIP phiên TRƯỚC — C3 animation + audio (trên `main`)
- **C3 đại tu GU + chiều sâu** (LIVE trên VPS): bento depth (elevation 2 lớp + sheen), donut/trend gradient, bỏ lặp nhãn, bento-host lấp khung, before→after, fix số tràn, s_emph/s_cmp. File `hyperframes-service/compositions/animation.html` → đã scp + rebuild VPS.
- **Fix audio méo cuối** (`097ce44`): chunk câu ≤400 ký tự + `previous_text`/`next_text` trong `elevenlabs.ts`. ⏳ CHƯA verify nghe lại.

## D. GIT / ĐƯỜNG DẪN — ⚠ LÀM ĐÚNG KẺO TOANG
- Repo chính: `/Users/tommy/Desktop/VideoSystem-claude-video-content-automation-PYlvQ/VideoSystem-claude-video-content-automation-PYlvQ/`.
- **NGUỒN CHÂN LÝ DUY NHẤT = GitHub branch `main`** (mới nhất tới `70d2eb0` — fix scripter).
- Phiên này làm trong git worktree `.claude/worktrees/cool-dirac-ecb529` (đã fast-forward lên origin/main + commit fix `70d2eb0`). Phiên sau có thể làm thẳng repo chính.
- 🔴 **LÀM ĐẦU TIÊN — đồng bộ về main** (repo chính/branch `Tommy` thường tụt sau origin/main → thiếu file → `npm run build` vỡ):
  ```bash
  cd "<repo chính HOẶC worktree đang dùng>"
  git fetch origin
  git merge --ff-only origin/main   # AN TOÀN nếu working tree sạch + chưa có commit riêng; không mất gì
  # nếu KHÔNG ff được (lỡ có commit rác local) → cân nhắc `git reset --hard origin/main`
  #   (CHỈ khi chắc mọi thứ quan trọng đã ở main — sẽ xoá thay đổi local chưa push)
  npm install && npx tsc --noEmit   # PHẢI pass rồi mới code tiếp
  ```
- **Push = deploy app:** `git push origin HEAD:main` → Vercel auto-build. (Tommy đã đồng ý workflow push thẳng main, test trực tiếp production. ⚠ Classifier auto-mode có thể chặn push main như bước an toàn — cần Tommy xác nhận/đồng ý trong chat hoặc thêm permission rule.)
- ⚠ `animation.html` (file render C3) chạy trên VPS, KHÔNG tự lên khi push. Sửa file render → sau push, đảm bảo repo chính = bản mới (sau ff/sync) RỒI scp + rebuild VPS (mục hạ tầng bên dưới). Bug đã gặp: scp nhầm file CŨ → render ra design cũ.
- Worktree cũ `epic-ride-dab9d7` / `affectionate-gates-c5ea9e` là của phiên trước — không cần.

## E. FILE MAP bộ não nội dung (đã làm — tham khảo khi sửa tiếp) + cách verify
**File của bộ não nội dung (đều đã có + hoạt động trên `main`):**
- `src/lib/integration-hub/adapters/gemini.ts` — adapter LLM; ĐÃ có grounding `google_search` (grounded→TEXT+citations) + lọc thinking-part. ⚠ grounded thì KHÔNG set JSON & GIỮ thinking.
- `src/lib/integration-hub/storage.ts` — type `ProfileRecord.strategy` (brandAngle+channelGoal+pillars). DB = KV-blob (key `db` trong Supabase `kv_store`) → KHÔNG cần migration cho field mới.
- `src/lib/profiles/actions.ts` — `createProfileAction` tự sinh strategy; `regenerateStrategyAction`/`updateStrategyAction`.
- `src/lib/agents/strategist.ts`(+`strategist-parse.ts`) — Part 1. `src/lib/agents/planner.ts`(+`planner-parse.ts`) — Part 2 (Trend Researcher + Topic Strategist chấm điểm).
- `src/lib/projects/{storage,actions}.ts` — ProjectRecord (topics + trendBrief + trendSources + scriptIds), `createProjectWithPlanAction`/`regeneratePlanAction`.
- `src/lib/agents/scripter.ts` — `generateScript` (Fact Researcher + Writer + `parseScriptJson` + retry). `src/lib/agents/auditor.ts` — Editor (hook/data/độ dài).
- `src/lib/scripts/actions.ts` — `generateScriptAction` (bắt lỗi 429/quota + lỗi parse → trả `{error}` cho UI).
- UI: `src/components/profiles/profile-strategy.tsx` (pillars), `src/components/projects/project-topics.tsx` (chủ đề chấm điểm → nút "Script + Audit"), `src/components/scripts/script-detail.tsx` (script + audit + nguồn + tab C1/C2/C3).

**Model thực tế:** LLM do config Integration Hub (Supabase) quyết định — **hiện production = `gemini-2.5-flash-lite`** (đã xác nhận: grep RSC `/settings/integrations`). Flash-lite YẾU với JSON phức tạp (gây bug mục B) → khuyến nghị đổi sang `gemini-2.5-flash` cho khâu script (đổi qua Settings→Integrations, không hardcode).

**Cách VERIFY content engine LIVE (headless, KHÔNG cần creds local) — kỹ thuật đã dùng phiên này:**
- Máy KHÔNG có `.env` creds → KHÔNG chạy agent local được. Test = headless browser trên production `video-system-five.vercel.app` (app không có auth thật).
- Cài: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright` (dùng Chrome hệ thống qua `channel:"chrome"`).
- Recon đọc trạng thái: mở `/profiles` (pillars), `/projects/<id>` (topics chấm điểm + trend brief — nhớ `details.open=true` vì brief thu gọn), `/scripts/<id>` (body/hook/cta + audit + tab C3). Tín hiệu billing: brief "0 nguồn" + dòng "⚠ KHÔNG có nguồn real-time" = billing TẮT.
- Gen script mới: click nút "Script + Audit" trên 1 topic chưa có script → chờ điều hướng `/scripts/<id>` → đọc body có sạch không, đếm từ, C3 keyMessages/dataPoints.
- (Script test tạm `_e2e_*.mjs` ở gốc worktree — gitignored kiểu `_*`, không commit.)

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
0) ĐỒNG BỘ GIT (repo/worktree thường tụt sau main, thiếu file → build vỡ nếu bỏ qua):
   cd "/Users/tommy/Desktop/VideoSystem-claude-video-content-automation-PYlvQ/VideoSystem-claude-video-content-automation-PYlvQ"
   git fetch origin && git merge --ff-only origin/main && npm install && npx tsc --noEmit
   (nếu KHÔNG ff được mới cân nhắc `git reset --hard origin/main` — sẽ xoá thay đổi local chưa push)
1) Đọc HẾT HANDOFF_VIDEOSYSTEM.md (đặc biệt mục "⚡ TL;DR — ĐANG LÀM ĐẾN ĐÂU") + BLUEPRINT_CONTENT_ENGINE.md
2) Đọc memory tại:
   /Users/tommy/.claude/projects/-Users-tommy-Desktop-VideoSystem-claude-video-content-automation-PYlvQ-VideoSystem-claude-video-content-automation-PYlvQ/memory/
   (MEMORY.md + các file con)
3) Tóm tắt lại cho tôi: (a) trạng thái hiện tại, (b) việc tiếp theo, (c) các quyết định đã chốt
   — để tôi xác nhận bạn đã hiểu đúng TRƯỚC khi bắt tay.

QUY TẮC CỨNG:
- Trả lời tiếng Việt. Web search/research BẮT BUỘC dùng exa MCP (chưa cài → cài trước, hoặc tạm web search built-in).
- KHÔNG bịa số liệu, KHÔNG báo cáo suông — đọc code trên đĩa + TỰ TEST (headless trên production: app không auth thật). tsc + build PHẢI pass trước khi push.
- Deploy app: git push origin HEAD:main (Vercel auto-build) — XIN PHÉP tôi trước khi push (classifier hay chặn; tôi đồng ý workflow này). File VPS (hyperframes-service/*): scp + 'docker compose up -d --build' (tôi chạy SSH; trước scp nhớ đồng bộ file về repo chính).
- Làm TỪNG PHẦN, nghiệm thu từng phần; đổi lớn hỏi tôi trước. **LUÔN cập nhật HANDOFF (mục TL;DR) khi xong 1 mốc** để không mất tiến độ nếu bị ngắt.

TRẠNG THÁI + VIỆC TIẾP THEO (chi tiết trong HANDOFF mục A–C):
- Bộ não nội dung Profile→Plan→Script ĐÃ CODE XONG + trên main (7 commit 59e7412…3cbc901). Đã tự test → chạy thật.
- Bug scripter parse JSON (script ra rác) ĐÃ FIX (70d2eb0). VIỆC NGAY: verify LIVE — gen 1 script mới, kiểm body văn xuôi sạch + word-budget + C3 có data. Nếu flash-lite vẫn yếu → đổi model LLM sang gemini-2.5-flash (Settings→Integrations).
- Billing Gemini CHƯA bật → grounding 0 nguồn (data từ trí nhớ model, KHÔNG real-time). Muốn số THẬT → tôi bật billing.
- Treo: verify audio méo cuối (097ce44); revoke key đã lộ (bảo mật).

Hãy đọc HANDOFF + memory, tóm tắt + xác nhận hiểu, rồi đề xuất bước tiếp.
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
