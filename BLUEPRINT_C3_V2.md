# BLUEPRINT — Nâng cấp C3 Animation v2 (dark/bright theme + icon + flow + caption + số thật)

> Tài liệu thiết kế + CHECKLIST SỐNG cho đợt nâng cấp C3. Cập nhật trạng thái mỗi khi xong 1 phần.
> Tham chiếu thẩm mỹ: video @escbase "6 prompt Claude Code Workflow" (dark, icon glow, pill-flow, caption karaoke).
> Quyết định đã chốt với Tommy (mọi option OK). KHÔNG đụng C1/C2 + read-script pipeline.

## 0. Quyết định đã chốt
1. **Theme LINH HOẠT theo chủ đề**: tài chính → **Dark Pro** (nghiêm túc, chỉn chu); công nghệ/đời sống → **Bright Energetic** (tươi, năng lượng). Map theo `profile.industry`.
2. **Icon**: Lucide SVG inline + CSS glow (semantic mỗi cảnh). Logo thương hiệu (vd Claude) = nhúng SVG chính thức khi cần. KHÔNG AI-gen.
3. **Caption**: phụ đề sync với **script CHÍNH** (giọng đọc hook+body+cta), karaoke tô keyword.
4. **Số liệu thật**: Tommy bật billing Gemini (1.500 grounded/ngày FREE ở mức dùng → ~$0). Code route số grounded thật + nguồn vào viz C3.
5. **Bỏ hạt bay** (ưu tiên tốc độ render — automation). Bỏ nhân vật 3D hero.
6. **Chỉ thay THẨM MỸ** áp lên scene đa dạng hiện có (không đổi sang format listicle).

## 1. File đụng tới
- `hyperframes-service/compositions/animation.html` — theme tokens dark + mode CSS + icon component + flow scene + caption layer + bỏ hero 3D. (⚠ sửa xong phải scp VPS + rebuild; render-test LOCAL bằng `_c3_render.mjs` trước.)
- `src/lib/video/builders/c3-animation.ts` — chọn theme theo industry; map icon mỗi scene; truyền caption (read-script + timing); route số grounded thật vào viz.
- `src/lib/agents/scripter.ts` — (nếu cần) thêm gợi ý icon/flow per keyMessage; đảm bảo số viz lấy từ fact brief khi có.
- Caption timing: dùng word-timestamps từ `src/lib/audio/whisper.ts` (đã có cho scene_times) — tái dùng cho caption.

## 2. Theme system (token 2 nhánh)
Mở rộng `THEMES` (animation.html ~L581) thêm field `mode` + token mode-dependent. Set `root.dataset.mode`.
**Bright (light, mode=light)** — giữ 3 theme sáng hiện có, tinh chỉnh accent energetic.
**Dark Pro (mode=dark)** — token đề xuất:
- bg1 `#0f0d17` bg2 `#17121f` · card `#1b1726` · cardBorder `rgba(255,255,255,0.08)` · ink `#f4f2fb` · sub `#a39db8`
- accent `#8b5cf6` accent2 `#22d3ee` (hoặc gold `#f5b748` cho tài chính) · glow `rgba(139,92,246,0.22)`
- elev dark: bóng nhẹ + **glow viền** thay vì đổ bóng đậm.
**Semantic tokens (cả 2 mode)**: `--good #34d399` · `--bad #f87171` · `--warn #fbbf24` — cho compare/good-bad.
**Tokenize các chỗ đang hardcode nền-sáng** (để dark chỉ cần đổi token):
- body bg gradient (L83-86 white fades) → token `--bg-glow1/2`.
- `.bento` border `rgba(120,90,210,0.08)` → `--card-border`. shadow → `--elev-1/2` (đã token, đổi giá trị theo mode).
- `.dotgrid` màu chấm `rgba(124,58,237,0.06)` → `--grid-dot` (dark nhạt hơn).
- sheen (`.bento-accent::before` …) — kiểm trên dark (giữ vì gradient card vẫn hợp).

## 3. Component mới / sửa
- **Icon glow semantic**: thay `.eyebrow.icon .ico` (44px) → icon-square lớn hơn (~60px) bo góc + bg tint + box-shadow glow màu accent. Inline SVG Lucide theo `iconName`. Map keyMessage/scene → iconName ở builder (vd "rule"→refresh, "kiểm chứng"→shield, "ngân sách"→coins…). Fallback icon mặc định.
- **Flow-diagram scene** (mới, học ref): pills nối bằng mũi tên `→` (ngang) hoặc quanh node trung tâm. Biến mới `flow` JSON `{steps:[{label,state}], arrow:true}` hoặc tái dùng `points`/`compare`. Scene `s_flow`.
- **Caption layer**: 1 div đáy (an toàn TikTok safe-zone), text từ read-script, tô keyword accent, đổi theo mốc thời gian (word-timestamps). Ẩn được (biến `captions` rỗng=ẩn) để giữ tương thích.
- **Bỏ hero 3D**: `img_hero` → deprecate (giữ biến cho backward-compat nhưng scene ẩn mặc định).

## 4. Số liệu thật vào viz (sau khi Tommy bật billing)
- scripter: khi có fact brief grounded → ưu tiên số THẬT cho bigStat/bars/donut + đính `sourceRef`.
- builder c3-animation.ts: gắn nhãn nguồn nhỏ ("Nguồn: …") cạnh số thật thay nhãn "(ví dụ)".
- Giữ cổng DataPointsEditor (Tommy duyệt) + chống bịa.

## 5. THỨ TỰ BUILD (checklist sống — cập nhật khi xong)
- [x] B1. Theme dark + tokenize + mode CSS (animation.html) → render-test dark vs bright. ✅ DONE: thêm 2 dark theme (idx 3 Dark Pro tài chính, idx 4 Dark Tech) + LIGHT/DARK_MODE token + `data-mode`; tokenize card-border/grid-dot/body-bg/elev. Render-test theme 3: 13 cảnh đều đẹp, 0 vỡ. (Còn quan sát: cảnh bignum hơi trống — theme-independent, để sau.)
- [x] B2. Icon glow semantic. ✅ DONE: icon eyebrow đã là Lucide-style sẵn → nâng `.ico` 44→58px + gradient accent→accent2 + box-shadow glow. Render-test dark+bright: nổi bật, premium 2 mode.
- [x] B3. Flow-diagram scene. ✅ DONE: composition tạo scene `s_flow` ĐỘNG (pills dọc + mũi tên ↓, pill cuối highlight=đích) + biến `flow` + CSS + thêm vào `order`. Builder parse `anim.flow` + dataPriority/ids/variable. Scripter thêm field `flow` + prompt (CHỈ điền khi có quy trình rõ). Render-test dark+light: đẹp, lấp khung. tsc+build PASS.
- [x] B4. Caption layer (sync read-script). ✅ DONE: composition thêm biến `captions` + `#capbox` + CSS (reserve chỗ đáy `[data-caps]`) + JS hook `tl.eventCallback("onUpdate")` render karaoke (said=ink, cur=accent, future=sub). Builder `buildCaptions(words,total)` gom Whisper word-timestamps thành phrase + truyền `captions`. Render-test dark+light: sync, không đè nội dung, đọc rõ 2 mode. tsc PASS.
- [x] B5. Bỏ hero 3D + dọn. ✅ DONE: buildAnimation bỏ gọi generateHeroImageUrl, img_hero="" (scene tự ẩn) → TIẾT KIỆM gpt-image + nhanh hơn. `generateHeroImageUrl` giữ lại = RESERVED cho AI-icon tương lai.
- [x] B6. Builder chọn theme theo industry. ✅ DONE: `themeForTopic(industry,seed)` — tài chính→dark idx 3, còn lại→bright 0-2. Fetch profile trong buildAnimation, override `theme` var. tsc+build PASS.
- [x] B7. Route số grounded thật vào viz (plumbing). ✅ DONE phần code: prompt Writer ƯU TIÊN số THẬT từ fact brief khi có (bỏ "ví dụ"); không có → minh hoạ ghi "ví dụ" (như cũ). ⏳ CHỈ kích hoạt + verify được khi Tommy BẬT BILLING Gemini (grounding ra số thật). Sources đã lưu sẵn + cổng DataPointsEditor duyệt tay. (Per-number source hiển thị TRÊN video: bỏ qua — rườm rà cho video ngắn; sources xem ở script-detail.)
- [ ] B8. tsc + build PASS · render-test full 1 video dark + 1 bright · self-eval. (B1/B2/B5/B6 đã test phần)

### Trạng thái deploy (B1-B7 code XONG, render-test pass)
- **Composition (animation.html)**: dark theme + glow icon + caption + flow ĐÃ ở git. **CẦN Tommy scp + rebuild VPS:**
  `scp .../hyperframes-service/compositions/animation.html root@76.13.223.45:~/hyperframes-service/compositions/animation.html`
  `ssh root@76.13.223.45 'cd ~/hyperframes-service && docker compose up -d --build'`
- **Builder (c3-animation.ts) + scripter**: push `git push origin HEAD:main` → Vercel. (theme-industry + caption + flow + bỏ hero + ưu tiên số thật.)
- ⚠ Nên scp composition + push builder GẦN nhau để finance video ra dark+caption ngay (không thì: builder mới + composition cũ → clamp về light, bỏ qua caption/flow — vẫn KHÔNG vỡ, chỉ chưa thấy look mới).
- Verify thật: Tommy gen 1 video tài chính (C3) sau khi scp+push → xem dark + caption + (flow nếu chủ đề có quy trình).

### 🔬 KẾT QUẢ RENDER THẬT trên VPS (script e8da57c3 tài chính) — tự test
- ✅ **dark theme + theme-theo-industry**: video render NỀN TỐI, accent cyan-violet — ĐÚNG (builder chọn dark cho finance).
- ✅ **mọi scene** (bignum/donut/trend/before-after/point/...) render đẹp trên dark; ✅ **icon glow**; ✅ **bỏ 3D** (không có nhân vật).
- ❌ **CAPTION KHÔNG hiện** trên video thật (chạy ở local nhưng không lên VPS). Chẩn đoán: `transcribeWords` (Whisper) trả `null` SILENT (key/quota/audio) → builder set `captions=""` → không có phụ đề. (`scene_times` cũng đang fallback theo trọng số → khớp giả thuyết whisper fail.)
- 🔧 **ĐÃ FIX**: `buildCaptions` thêm FALLBACK — whisper null thì chia đều read-script theo thời lượng → VẪN có caption. Test 7/7 + tsc/build PASS. (Whisper chạy được thì caption sync chuẩn hơn.)
- ✅ **CAPTION ĐÃ VERIFY trên production** (render lại sau fix + re-scp): băng đáy 40 frame đầy phụ đề karaoke đúng read-script, keyword tô màu, không đè nội dung. HOÀN TẤT.
  - Quá trình: push builder fix `65e7d1e` → re-scp composition (lần đầu scp lỗi do path `.../`) → **gặp HTTP 404** (container rebuild lỗi/mong manh sau scp-lỗi, KHÔNG phải code: `/health`=200, `/render`=401 route OK) → re-scp ĐÚNG full-path + rebuild (container recreate sạch) → re-render → **caption hiện**.
  - Bài học: (1) scp PHẢI full-path (đừng `.../`); (2) Docker `COPY . . CACHED` OK nếu file scp giống bản đã bake; (3) sau rebuild lỗi, container có thể mong manh → recreate sạch là khỏi.

### Tình trạng cuối — C3 v2 (đã deploy + verify production)
- ✅ dark theme · ✅ icon glow · ✅ caption karaoke · ✅ bỏ 3D · ✅ theme-theo-industry — TẤT CẢ chạy thật trên video VPS.
- ⏳ flow: không xuất hiện ở render test (script cũ không có data flow) — sẽ hiện với chủ đề CÓ quy trình (scripter mới sinh field flow).
- ⏳ B7 số thật: plumbing đã deploy, kích hoạt khi Tommy bật billing Gemini.
- ✅ (đã xử ở Round 2) vài cảnh thưa/hở giữa (bars 2 thanh, mini-stat, point) — xem mục 8.

## 8. ĐỢT LÀM GIÀU DATA + CHIỀU SÂU (Round 2 — feedback Tommy sau clip regen)
> Feedback: (a) bố cục chưa có chiều sâu, (b) 2 bản số liệu chia ra → khúc giữa trống, (c) CTA icon tay → mũi tên,
> (d) QUAN TRỌNG: point scenes 1-2-3-4 mơ hồ, không ra "bảng hướng dẫn" → LÀM GIÀU số liệu cụ thể (AI hiệu quả tới đâu,
> tiết kiệm thời gian thế nào), mang kiến thức bổ ích. "Chọn option xịn nhất, thẩm mỹ nhất, làm hết."

- [x] R2.1 **Point scene = THẺ HƯỚNG DẪN giàu data** (option đã chọn = xịn nhất): mỗi điểm gồm **tiêu đề bước** (kinetic, lớn)
  + **cách làm/giải thích** (detail — DẠY kiến thức) + **thẻ số liệu** (gradient: value+unit+label). 2 THẺ XẾP LỚP (thẻ dạy
  elevation-1 + gáy gradient bên trái · thẻ số gradient elevation-2) + **watermark số khổng lồ** phía sau → CHIỀU SÂU. Căn
  giữa dọc → hết hở giữa. Composition: CSS `.ptwrap/.pttop/.ptstat/.ptwm` + JS dựng {title,detail,stat} + timeline thẻ-vào-rồi-chữ-chạy.
- [x] R2.2 **Mini-stat grid hết hở giữa**: `.ministat justify-content: space-between→center` (grid 1fr kéo cao → icon top/value bottom hở giữa) → cụm icon+value+label căn giữa thẻ. Bars đã `justify-content:center` (đợt trước).
- [x] R2.3 **CTA mũi tên**: bỏ emoji 👇, dùng SVG mũi tên xuống `#s7 .e3 svg` 54px (chuyên nghiệp hơn).
- [x] R2.4 **Wiring scripter**: thêm field `animation.points: [{title,detail,stat:{value,unit,label}}]` + prompt (point i ↔ keyMessages[i],
  detail DẠY cụ thể ≤22 từ, stat ƯU TIÊN số thật fact-brief / không có → "ví dụ", mỗi stat KHÁC nhau). keyMessages vẫn giữ (đồng bộ).
- [x] R2.5 **Wiring builder**: `c3-animation.ts` map `anim.points` (giàu) → pointScenes {n,total,title,detail,stat}; thiếu → fallback
  keyMessages (chỉ title, backward-compat). Cắt giới hạn an toàn. **Test 6 ca biên PASS** (rich/fallback/thiếu field/tràn/rỗng).
- [x] R2.6 **Self-test**: render-test theme 3 (dark) + theme 0 (bright) — point 2 thẻ xếp lớp đẹp, mini-stat đều, bars/CTA OK. tsc + build PASS.
- [x] R2.7a **Deploy Vercel + VERIFY SCRIPTER THẬT**: ✅ pushed `916352d` (deploy READY production). Gen 1 script MỚI live (id `f9ed585c`, chủ đề AI lộ trình) → scripter sinh ĐÚNG `animation.points` giàu (3 thẻ: title+detail DẠY cụ thể+stat). 🔥 **GROUNDING NAY CHẠY**: fact researcher trả **8 nguồn THẬT** (vneconomy/tuoitre/vietnamnet… grounding-api-redirect) + số 2024 cụ thể → số liệu point là GROUNDED không phải bịa (billing hình như đã bật — xem memory). Render LOCAL data thật trong composition mới: 3 point card đẹp + flow 4 bước + bars 2 thanh căn giữa (đúng cái Tommy than "2 bản chia ra"). Builder map: edge-test 6 ca PASS.
- [ ] R2.7b **Verify VIDEO THẬT trên VPS**: ⏳ CẦN Tommy scp composition mới + rebuild → gen/re-render 1 video → xem point cards giàu + chiều sâu trên video render thật (như lần verify caption). Backward-compat: builder gửi `text=title` nên dù chưa scp, point KHÔNG vỡ (chỉ hiện title-only tới khi scp).

### Trạng thái deploy Round 2
- ✅ **Scripter + builder**: ĐÃ push `916352d` → Vercel READY. Verify live: rich points + grounded. KHÔNG vỡ với composition cũ (text=title).
- ⏳ **Composition (animation.html)**: point cards + mini-stat fix + CTA arrow — Ở GIT, **CẦN Tommy scp + rebuild VPS** (lệnh như mục 5 trên) để point cards GIÀU hiện trên video thật.

## 6. Cách test (đã có công cụ)
- Render LOCAL offline: `node _c3_render.mjs` (Playwright + Chrome hệ thống, inject biến mẫu, step-frame count-up) → ảnh `/tmp/c3frames/`. So sánh ref `/tmp/vidframes/`.
- KHÔNG cần VPS để iterate. Khi C3 ổn → Tommy scp animation.html + `docker compose up -d --build`.
- App code (builder/scripter): tsc + build + push main (Vercel).

## 7. Tiến độ (cập nhật liên tục)
- (đang làm) B1 — theme dark.
