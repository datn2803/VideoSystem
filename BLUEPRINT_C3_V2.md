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
- [ ] B3. Flow-diagram scene → render-test. (chưa làm)
- [x] B4. Caption layer (sync read-script). ✅ DONE: composition thêm biến `captions` + `#capbox` + CSS (reserve chỗ đáy `[data-caps]`) + JS hook `tl.eventCallback("onUpdate")` render karaoke (said=ink, cur=accent, future=sub). Builder `buildCaptions(words,total)` gom Whisper word-timestamps thành phrase + truyền `captions`. Render-test dark+light: sync, không đè nội dung, đọc rõ 2 mode. tsc PASS.
- [x] B5. Bỏ hero 3D + dọn. ✅ DONE: buildAnimation bỏ gọi generateHeroImageUrl, img_hero="" (scene tự ẩn) → TIẾT KIỆM gpt-image + nhanh hơn. `generateHeroImageUrl` giữ lại = RESERVED cho AI-icon tương lai.
- [x] B6. Builder chọn theme theo industry. ✅ DONE: `themeForTopic(industry,seed)` — tài chính→dark idx 3, còn lại→bright 0-2. Fetch profile trong buildAnimation, override `theme` var. tsc+build PASS.
- [ ] B7. Route số grounded thật vào viz + nhãn nguồn. (chưa làm — cần Tommy bật billing trước để có số thật.)
- [ ] B8. tsc + build PASS · render-test full 1 video dark + 1 bright · self-eval. (B1/B2/B5/B6 đã test phần)

### Trạng thái deploy
- Composition (animation.html B1/B2): mới ở git, CHƯA scp VPS — đợi gom B3/B4 rồi Tommy scp 1 lần.
- Builder (c3-animation.ts B5/B6): ở git, CHƯA push main — đợi gom để tránh trạng thái nửa vời (no-hero+light) trước khi VPS có dark.

## 6. Cách test (đã có công cụ)
- Render LOCAL offline: `node _c3_render.mjs` (Playwright + Chrome hệ thống, inject biến mẫu, step-frame count-up) → ảnh `/tmp/c3frames/`. So sánh ref `/tmp/vidframes/`.
- KHÔNG cần VPS để iterate. Khi C3 ổn → Tommy scp animation.html + `docker compose up -d --build`.
- App code (builder/scripter): tsc + build + push main (Vercel).

## 7. Tiến độ (cập nhật liên tục)
- (đang làm) B1 — theme dark.
