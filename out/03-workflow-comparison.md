# Workflow So Sánh — Lean (đã làm) vs Production (nên đầu tư)

> Mục đích: bạn hiểu **chính xác cái gì** đã tạo nên video v2, **gap so với chuẩn**, và **mua đúng cái nào** để tự làm lại thủ công đạt 95% chất lượng kịch bản đã viết.

---

## A. WORKFLOW VỪA LÀM — Lean ($0)

8 bước, từ ý tưởng → MP4 hoàn chỉnh 1:42, **không phí trừ 2 đồng API**:

| # | Bước | Tool | Output | Cost | Thời gian |
|---|---|---|---|---|---|
| 1 | Chiến lược content + Kịch bản (md) | Claude (tôi) viết tay | `01-content-strategy.md` + `02-script-case.md` | $0 | 15 min |
| 2 | Tách 7 đoạn voiceover từ kịch bản | Code Node.js | `scripts/v2-render-voices.mjs` | $0 | 5 min |
| 3 | TTS 7 đoạn giọng nam | ElevenLabs **free** (10K chars/mo), voice "Eric" + multilingual v2 | 7 MP3 (~1.5KB used quota) | $0 | 18s render |
| 4 | Source 7 ảnh stock | Pexels (search → download) | 7 JPG ~1.8MB total | $0 | 5 min |
| 5 | Thiết kế 12 text overlay (panel/box/data viz tĩnh) | Python PIL + Arial Unicode font (macOS built-in) | 12 PNG ~400KB | $0 | 10 min code |
| 6 | Per-scene composite (image + Ken Burns + overlay fade + voice) | ffmpeg (brew) — filter_complex: `scale`+`crop`+`zoompan`+`format=rgba`+`fade`+`overlay`+`libx264` | 7 scene MP4 ~32MB | $0 | 52s render |
| 7 | Concat 7 scene → 1 MP4 | ffmpeg demuxer (-c copy, sharp cut) | 1 final MP4 31.3MB | $0 | 0.2s |
| 8 | Branding chip "VŨ Ở SHINHAN" top-left mọi cảnh | PIL → PNG → ffmpeg overlay | persistent watermark | $0 | included |

**Tổng cost ra 1 video:** ~**$0.0006** (DeepSeek scriptgen — nếu có dùng).
**Tổng thời gian:** ~5 phút render từ assets đã có sẵn.

**Cái Workflow A LÀM ĐƯỢC:**
- ✅ Script tiếng Việt chuẩn banker, đúng compliance NHNN
- ✅ Voice nam tiếng Việt nghe được (có accent nhẹ)
- ✅ Visual text overlay đúng brand carbon/navy/gold, Vietnamese diacritics OK
- ✅ Animation cơ bản: Ken Burns zoom, fade in/out, branding watermark
- ✅ Đúng format 9:16 1080×1920 30fps, H.264 + AAC, ready upload TikTok/Reels/Shorts
- ✅ Reproducible: chạy lại 1 lệnh, đổi text/topic/voice là ra video mới

**Cái Workflow A KHÔNG LÀM ĐƯỢC:**
- ❌ **Vũ thật** — dùng stock Asian businessman, ai cũng thấy không phải Vũ
- ❌ **Talking head động** — chỉ tĩnh + Ken Burns, không có lip-sync, không có cử chỉ
- ❌ **B-roll động** — 6 ảnh tĩnh, không phải video cảnh thật
- ❌ **Animated charts** — overlay tĩnh (BẪY TÀI CHÍNH box, SO SÁNH TRƯỚC-SAU không có)
- ❌ **Music + sound design** — silent ngoài voice
- ❌ **Crossfade** giữa scenes — cut sharp
- ❌ **Vietnamese voice native** — Eric multilingual có accent (không phải Bắc/Nam Việt thuần)

---

## B. WORKFLOW LÝ TƯỞNG — Production ($30-150/tháng)

10 bước, ra video chuẩn agency-level. Mỗi bước có **tool đề xuất** + **giá** + **độ khó tự làm**.

### Bước 1 — Chiến lược + Kịch bản (giữ free, nâng chất lượng)
**Giữ Claude/DeepSeek** sinh draft → **bạn polish thủ công** với context Shinhan/khách hàng thật → final markdown.
- Cost: $0–5/tháng (API)
- Skill: viết tay rõ thông điệp, biết audience
- ⚠️ Đừng để AI tự viết và đăng — output không có chiều sâu thật

### Bước 2 — Voice Vietnamese NATIVE (quan trọng nhất)

**3 lựa chọn, xếp theo chất lượng:**

| Lựa chọn | Cost | Quality | Thời gian/video |
|---|---|---|---|
| 🥇 **Vũ tự thu** trên iPhone (Voice Memo) | $0 | 100% natural, authentic | 5–10 phút thu lại nhiều take |
| 🥈 **FPT.AI TTS** | Gói **~200K-500K VND/tháng** | 90% (giọng Bắc/Nam thuần) | 30s API call |
| 🥉 ElevenLabs Multilingual (đã dùng) | $5–22/m | 70% (accent nhẹ) | 30s |

**Đề xuất:** Vũ tự thu → bạn có "voice signature" của brand. Cohort sau dạy banker khác làm tương tự = giá trị education tăng.

### Bước 3 — Vũ Talking Head (cảnh có mặt Vũ)

**3 lựa chọn:**

| Lựa chọn | Cost | Quality | Lưu ý |
|---|---|---|---|
| 🥇 **Vũ shoot thật iPhone** + đèn ring (3–5tr 1 lần) | One-time 5tr setup | 100% chân thực | Cần 1–2 buổi shoot/tháng, cần kịch bản chi tiết (✅ đã có) |
| 🥈 **HeyGen Creator Plan** + 1 ảnh Vũ → photo avatar AI lip-sync | **$24/tháng** | 80% (AI dễ "uncanny") | Tốt khi Vũ bận, nhưng audience tinh sẽ nhận ra AI |
| ❌ Stock placeholder (đã dùng) | $0 | 0% (không phải Vũ) | Chỉ dùng để demo pipeline, không production |

**Đề xuất:** Vũ shoot thật. Buổi shoot 2h = đủ 10–15 video talking head (B-roll cho 1 tuần lễ content).

### Bước 4 — B-roll (cảnh không có mặt Vũ — laptop, thẻ TD, nhà, calculator...)

**4 lựa chọn:**

| Lựa chọn | Cost | Quality | Note |
|---|---|---|---|
| 🥇 **Vũ tự shoot** scenes làm việc | $0 | 100% authentic, branded | Quay cùng buổi talking head: 30 phút thêm |
| 🥈 **Pexels Video / Mixkit free** MP4 | $0 | 70% (footage thật, người khác) | Có sẵn, không có watermark |
| 🥉 **Storyblocks / Envato Elements** | **$16–30/tháng** | 90% premium footage | Unlimited download, biz license |
| ⚠️ **AI video gen (Veo 3, Runway, Kling)** | $15–95/m hoặc $0.05–0.10/s | 75% — tự nhiên không thật 100% | Hữu ích cho cảnh khó shoot (drone city, dramatic) |

**Đề xuất:** Combo **Vũ tự shoot + Pexels Video free** + thi thoảng AI gen cho cảnh khó. Storyblocks không cần thiết tháng đầu.

### Bước 5 — Animated Data Viz (C3 Animation — hạt nhân khác biệt)

**Đây là pillar bạn muốn nhất** (kịch bản đã chỉ rõ: BẪY TÀI CHÍNH box, SO SÁNH TRƯỚC-SAU, 3 step circles). Hiện làm tĩnh trong PIL → cần ĐỘNG.

**3 lựa chọn:**

| Lựa chọn | Cost | Quality | Tự làm? |
|---|---|---|---|
| 🥇 **HyperFrames + VPS** (Roadmap v2 Phase 3+4) | $5–10/m VPS đã có | 100% — đúng vibe MagentX, control toàn diện | Cần 2–3 ngày tôi setup + code template |
| 🥈 **CapCut Pro motion graphics** + template thuê designer (200–500K/template, dùng mãi) | $7/m + 500K one-time | 85% | Setup 1 lần, sau đó copy-paste fill data |
| 🥉 **Lottie animations free** (lottiefiles.com) + ghép trong ffmpeg/CapCut | $0 | 70% | Có sẵn 1000+ template, chỉ fill data |

**Đề xuất:** Đầu tư **HyperFrames + VPS Phase 3+4** (đã pause hôm nay). Đây là **đòn bẩy lâu dài** — 1 lần setup, dùng cho HÀNG TRĂM video. CapCut là backup nếu chưa muốn động tới VPS.

### Bước 6 — Background Music (arc cảm xúc)

| Lựa chọn | Cost | Quality |
|---|---|---|
| 🥇 **Epidemic Sound** | **$15/tháng** | 95% — kho 40K+ track, sub-genre filter, có "tense → hopeful → uplifting" sẵn |
| 🥈 **Artlist** | $16/tháng | 90% — biz license tốt cho social |
| 🥉 **Pixabay / Mixkit free** | $0 | 70% — phải lùng nhiều, không có biz license rõ |
| 🤖 **AIVA / Mubert AI music** | $11–30/m | 80% — AI sinh theo mood, nhưng đôi khi flat |

**Đề xuất:** Epidemic Sound $15/m. Search "corporate tense" + "uplifting business" + "cinematic finance" → 3 track/video. Có ngay sound effects (swoosh, ding) miễn phí trong gói.

### Bước 7 — Editing / Compositing (ghép xương sống)

**Đây là quyết định lớn nhất.**

| Tool | Cost | Pros | Cons |
|---|---|---|---|
| 🥇 **CapCut Pro Desktop** | $7.99/tháng | TikTok-native UI, **auto-subtitle Vietnamese**, kho text animation, hiệu ứng built-in, dễ học cho nhân viên | Mac/Win/iPad. Không scriptable. |
| 🥈 **Premiere Pro + After Effects** | $55/m (Adobe CC) | Pro full control, motion graphics mạnh | Học 3–6 tháng mới rành |
| 🥉 **DaVinci Resolve** free | $0 | Color grading pro miễn phí | UX nặng cho người mới |
| 🤖 **ffmpeg script** (đã làm) | $0 | Reproducible, automation full | Khó iterate sáng tạo, không có timeline GUI |

**Đề xuất:** **CapCut Pro $8/m** cho biên tập thủ công + ffmpeg script cho batch automation (vd. sinh hàng loạt variant intro/CTA). Hai cách bù trừ nhau.

### Bước 8 — Subtitle Vietnamese (40% TikTok user tắt tiếng)

| Lựa chọn | Cost | Quality |
|---|---|---|
| 🥇 **CapCut auto-subtitle** (built-in CapCut Pro) | $0 (trong gói) | 95% — Vietnamese OK, dễ chỉnh |
| 🥈 **Whisper API** (OpenAI) → SRT → ffmpeg burn-in | $0.006/phút audio | 90% |
| 🥉 ffmpeg drawtext (cần freetype build) | $0 | 70% — manual time |

**Đề xuất:** CapCut auto.

### Bước 9 — Sound Design (transitions, accents)

**Nếu mua Epidemic Sound** → có sẵn SFX library (woosh, ding, riser, impact). Drop và CapCut.

**Free alternative:** zapsplat.com (free signup), freesound.org.

### Bước 10 — QC + Compliance review

**Bắt buộc với content tài chính.** Trước khi đăng:
- [ ] Disclaimer "case ẩn danh, số liệu minh họa"
- [ ] Không nêu tên ngân hàng đối thủ
- [ ] Không cam kết lãi suất X%/năm trong toàn thời hạn
- [ ] Không hứa "100% duyệt"
- [ ] Caption ≤ 2200 ký tự (TikTok)
- [ ] Hashtag set sẵn cho Vũ

**Tool:** checklist trong Notion / Linear / Trello. **Quy trình > tool**.

---

## C. PHÂN TÍCH COST: NÊN MUA GÌ TRƯỚC

Sắp xếp theo **ROI** (giảm chất lượng / mỗi đồng tiết kiệm):

### Mua NGAY (mỗi tháng = 1 video tệ thành tốt)
1. ✅ **Epidemic Sound — $15/m** — music + SFX. Audio chiếm 50% cảm xúc video. Đáng đầu tiên.
2. ✅ **CapCut Pro — $8/m** — editing GUI. Cứu nhân viên skill thấp ghép tay (đúng triết lý roadmap "tách tạo khỏi ghép").

### Mua NGẮN HẠN (sau 2 tuần test)
3. ✅ **FPT.AI Gói TTS Việt 200–500K/m** — chỉ nếu Vũ không tự thu được. Còn nếu Vũ thu được = bỏ qua.

### Đầu tư MỘT LẦN
4. ✅ **Setup shoot iPhone + đèn ring + mic lavalier — ~5tr VND** — equipment cho Vũ self-shoot. Dùng mãi.
5. ✅ **HyperFrames VPS setup** (Phase 3+4) — 2–3 ngày tôi setup. **Free về tiền, đắt về thời gian, nhưng dùng cho hàng trăm video sau.**

### Mua DÀI HẠN (nếu scale 30+ video/tháng)
6. ⚪ Storyblocks $20/m — premium video stock. Chỉ khi Vũ không shoot đủ.
7. ⚪ Adobe CC $55/m — chỉ khi có editor full-time.

### KHÔNG MUA (cho stage này)
- ❌ HeyGen Creator $24/m (avatar AI — uncanny, không hợp banker thật)
- ❌ Runway Gen-4 $15-95/m (AI video gen — không cần thiết khi shoot thật được)
- ❌ Adobe After Effects ($23/m solo) — overkill cho TikTok short-form

---

## D. KỊCH BẢN "TUẦN ĐẦU TỰ LÀM"

Giả định mua **Epidemic $15 + CapCut Pro $8 = $23/tháng** + iPhone Vũ + đèn:

| Ngày | Việc | Thời gian |
|---|---|---|
| **T2** | Vũ shoot 7 cảnh talking head cho 1 video (theo kịch bản `02-script-case.md`) | 1h |
| **T2** | Vũ thu 7 đoạn voice (Voice Memo) hoặc shoot luôn có voice | (included) |
| **T3** | Vũ shoot 4-5 cảnh B-roll (laptop, thẻ TD, calculator, ngôi nhà…) | 30 phút |
| **T3** | Tôi sinh text overlay PNG (12 cái) — đã có sẵn từ video v2, có thể tái dùng | 5 phút |
| **T4** | Bạn / editor mở CapCut Pro → import: 7 talking head + 5 B-roll + 7 voice + 12 PNG + 2 nhạc | 10 phút import |
| **T4** | Drag-drop theo timeline kịch bản. CapCut auto-subtitle. | 1.5h |
| **T4** | Add SFX (swoosh, riser) ở transition | 20 phút |
| **T5** | Bạn QC: check compliance NHNN, caption, hashtag | 15 phút |
| **T5** | Upload TikTok/Reels/YT Shorts | 10 phút |

**Tổng/video:** ~4h người ngồi (lúc đầu, sau quen còn 2h). **$23/tháng vận hành.**

Khi quen rồi:
- Vũ shoot 1 buổi/tuần = đủ 5 video
- Editor làm 1 ngày/tuần ghép 5 video
- Bạn QC + đăng cuối tuần

---

## E. SO SÁNH NHANH

| Tiêu chí | Workflow A (đã làm) | Workflow B (tự làm có trả tiền) |
|---|---|---|
| Cost/tháng | $0 | $23–50 |
| Cost lần đầu | $0 | 5tr (equipment) |
| Chất lượng | 50% kịch bản | 90–95% kịch bản |
| Người trên video | Stock photo | **VŨ THẬT** |
| Voice | AI accent nhẹ | **Vũ thật hoặc native Vietnamese** |
| B-roll | Ảnh tĩnh + Ken Burns | Video shoot thật + 1-2 stock |
| Animated data viz | Tĩnh (PIL) | Động (CapCut motion / HyperFrames) |
| Music | Không | Epidemic Sound arc |
| Subtitle | SRT sidecar | Burn-in auto |
| Thời gian/video | 5 phút render | 4h người ngồi |
| Scalability | Auto pipeline | Phụ thuộc người |

---

## F. ĐỀ XUẤT CUỐI

**Step 1 (tuần này):** Bạn mua **$23/tháng (Epidemic + CapCut)** + sắm equipment 5tr (iPhone bạn có, mua thêm đèn ring + lavalier mic). Vũ thử shoot 1 video theo kịch bản `02-script-case-200tr-6ty.md`.

**Step 2 (tuần sau):** Bạn cho tôi xem video Vũ shoot. Tôi sẽ ghép thử **kết hợp**: voice Vũ thật + b-roll Vũ + text overlay tôi đã design (PIL PNG) + 1 nhạc Epidemic bạn pick. Output video chuẩn 90%.

**Step 3 (sau khi MVP ổn):** Resume Phase 3+4 — VPS + HyperFrames cho animated data viz pillar CORE (chuyên gia đòn bẩy). Đây là lúc khác biệt với mọi banker TikTok khác.

Bạn quyết step nào trước?
