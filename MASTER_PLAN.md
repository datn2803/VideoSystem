# MASTER PLAN — VideoSystem × "Vũ ở Shinhan"
### Tự động hóa video TikTok bằng HeyGen (avatar) + ElevenLabs (voice clone)

> Phiên bản: 1.0 · Ngày: 2026-05-29 · Owner: Tommy 
> Mục tiêu tối cao: làm CHUẨN, test kỹ, **không đốt credit HeyGen/ElevenLabs oan**.
> Nguyên tắc vàng: **Tiền chỉ được tiêu ở Track C. Track A + B phải xong và đạt trước.**

---

## 0. Bối cảnh & quyết định đã chốt

- **Use case thật**: kênh TikTok "Vũ ở Shinhan" (Supervisor Retail RM, vay thế chấp Shinhan Bank). Chiến lược + 3 storyboard mẫu đã có.
- **Vật thí nghiệm trước**: Tommy dùng chính mặt + giọng mình để test toàn bộ pipeline trước khi làm cho Vũ → có case study thật, de-risk.
- **LLM pipeline giai đoạn test**: **Gemini free** (giống JARVIS). Build code: Claude Code (Max plan). → LLM gần như $0.
- **Chỉ có credit HeyGen + ElevenLabs là tiền thật.**

### Đính chính quan trọng về "free" (tra cứu 2026-05)
- **HeyGen**: bỏ free API từ 2/2026. Free = 3 video/tháng, 720p, **có watermark, CHỈ web UI, KHÔNG có API**. Chạy bằng code (`c1-talking.ts`) ⇒ bắt buộc trả phí (pay-as-you-go credit). Web plan ≠ API, tính tiền tách rời.
- **ElevenLabs**: free app ~10k credit/tháng (~10 phút TTS), clone giọng free bị giới hạn, **không có quyền thương mại**. API free chỉ 10 credit/tháng (vô dụng để tự động hóa).
- ⇒ **"Test free" = thủ công trên web UI + chạy pipeline bằng mock adapter.** Không phải chạy API miễn phí.

---

## 1. Ba track thực thi

| Track | Mục tiêu | Chi phí | Công cụ | Điều kiện bắt đầu |
|---|---|---|---|---|
| **A — Khóa pipeline** | Code đúng, end-to-end chạy bằng mock | **$0** | Mock adapter + Gemini free | Bắt đầu ngay |
| **B — Test chất lượng người thật** | Giọng Việt + lip-sync đạt không? | **$0** (web UI free) | HeyGen web UI + ElevenLabs web | Song song với A |
| **C — Bật API thật** | Pipeline tự động ra video thật | **Tiền thật** | HeyGen API + ElevenLabs Starter | Chỉ khi A ✅ và B ✅ |

---

## 2. TRACK A — Khóa pipeline bằng mock (FREE, ưu tiên #1)

Đây là 80% khối lượng code và **hoàn toàn miễn phí**. Mục tiêu: khi bật API ở Track C thì chỉ việc "cắm key", không sửa logic.

### A1. Mở rộng schema script → timeline có timecode
File: `src/lib/agents/scripter.ts` + `src/lib/scripts/storage.ts`

Hiện tại `variantPrompts.talking` chỉ là 1 string → **không đủ** để tái lập storyboard "Vũ ở Shinhan". Cần schema giàu hơn:

```ts
type EmotionCue = "neutral" | "tense" | "urgent" | "confident" | "warm" | "excited";
type VisualType  = "talking_head" | "broll" | "chart" | "text_card";
type BlockKind   = "hook" | "problem" | "body" | "solution" | "cta";

interface StoryboardSegment {
  index: number;
  block: BlockKind;        // 6-khối: hook→problem→body→solution→cta
  startSec: number;
  endSec: number;
  dialogue: string;        // lời nói → feed ElevenLabs (TTS)
  emotion: EmotionCue;     // điều khiển stability/style của ElevenLabs
  visual: { type: VisualType; note: string };
  onScreenText: string;    // text overlay lớn (đỏ/vàng/trắng)
  effect: string;          // "zoom số tiền", "icon ⚠️", "pop-up 1-2-3"...
}

interface TalkingStoryboard {
  topic: string;
  totalDurationSec: number;       // mục tiêu ~40-60s khi test, ~100s khi thật
  aspectRatio: "9:16";
  segments: StoryboardSegment[];
  thumbnail: { headline: string; subText: string; visualNote: string };
  productionTips: string[];
  caption: string;
  hashtags: string[];
}
```

> Đây chính là "bộ khung 6 khối" của storyboard Vũ ở Shinhan được mã hóa cho máy đọc. `dialogue` nối lại = kịch bản ElevenLabs đọc; `emotion` điều khiển sắc thái giọng; `onScreenText`/`visual`/`effect` cho lớp dựng.

**Việc cần làm:**
- [ ] Thêm type `TalkingStoryboard` vào script schema.
- [ ] Cập nhật prompt `scripter.ts` (SYSTEM + buildPrompt) yêu cầu LLM trả về JSON đúng schema 6 khối, có timecode.
- [ ] Giữ backward-compat: `variantPrompts.talking` string cũ vẫn để fallback.
- [ ] Test parse JSON với Gemini free (Gemini hay trả JSON lệch → cần `responseFormat:"json"` + validate bằng zod).

### A2. Validate bằng mock end-to-end
- [ ] Chạy `/projects` → Planner (Gemini) sinh chủ đề → chọn 1 → Scripter sinh `TalkingStoryboard` → Auditor check → mock voice → mock render 3 concept → Review Kanban.
- [ ] Xác nhận: không 1 lần nào gọi HeyGen/ElevenLabs thật (mock adapter trả placeholder).
- [ ] Tiêu chí pass A: pipeline chạy trọn, storyboard JSON đúng schema, Auditor hoạt động, Review hiển thị đủ.

### A3. Auditor — chặn rủi ro compliance TRƯỚC khi tốn credit
File: `src/lib/agents/auditor.ts` (đã có 7 rule banking VN).
- [ ] Bổ sung/kiểm rule cho đúng các bẫy trong storyboard mẫu: con số lãi suất cụ thể ("7.2%/năm"), cam kết thời gian ("duyệt 5 ngày"), **so sánh trực tiếp ngân hàng A/B/C/D** (rule `no_competitor_attack`), hứa tiết kiệm số cụ thể.
- [ ] **Auditor PHẢI chặn render nếu status = fail** — đây cũng là cost-guard (script vi phạm không được phép tốn credit HeyGen). Verify luồng block này trong `orchestrator`/actions.
- [ ] Tiêu chí: inject script "lãi suất 100% an toàn cao nhất thị trường" → fail → KHÔNG render.

### A4. Cost-guard trong code (BẮT BUỘC trước Track C)
Vì mỗi render HeyGen = tiền thật:
- [ ] **Cache theo hash**: hash(script + voiceId + avatarId). Trùng hash ⇒ trả lại video cũ, không render lại. (mở rộng `videoStore`).
- [ ] **Mode toggle rõ ràng**: `RENDER_MODE = mock | dryrun | live` trong config. Mặc định KHÔNG phải `live`.
- [ ] **Confirm-before-spend**: ở UI, nút render thật phải có bước xác nhận + hiển thị credit ước tính.
- [ ] **Giới hạn auto-retry**: `orchestrator.ts` hiện auto-retry — chặn retry vô hạn với provider trả phí (tối đa 1 lần, log rõ).
- [ ] **Ước tính credit trước khi gọi**: 1 credit HeyGen ≈ 60s video; hiển thị "clip này ~X credit" trước khi bấm.
- [ ] **Usage meter**: tận dụng `provider_usage` để cộng dồn credit/ngày, cảnh báo khi vượt ngưỡng tự đặt.

---

## 3. TRACK B — Test chất lượng người thật (FREE, web UI thủ công)

Mục tiêu **duy nhất**: trả lời câu sống-còn — *giọng Việt clone có nghe được không + avatar lip-sync có khớp không* — mà KHÔNG tốn API.

### B1. Quay footage avatar (HeyGen web UI)
- [ ] 2–5 phút, **dọc 9:16, 1080p**, ánh sáng đều, nền tĩnh, nhìn thẳng camera, nói tự nhiên.
- [ ] Quay sẵn **video consent** (HeyGen bắt buộc câu xác nhận cho phép clone).
- [ ] Tạo avatar trong HeyGen web (free 3 video/tháng để test).

### B2. Thu mẫu giọng (ElevenLabs web)
- [ ] ~1 phút audio sạch, mic tốt, **thu thẳng tiếng Việt**.
- [ ] Đọc **đa dạng cảm xúc**: vài câu nghiêm túc/căng (cho khối hook) + vài câu phấn khích/tự tin (cho khối giải pháp) → clone học được sắc thái.
- [ ] Tạo voice clone (lưu ý: free giới hạn, không thương mại — chỉ để chấm chất lượng).

### B3. Render 1 clip test bằng tay
- [ ] Lấy **kịch bản test 40–60s** (em sẽ viết — đề xuất rút gọn storyboard "3 sai lầm" để sau so sánh với bản thật của Vũ).
- [ ] ElevenLabs đọc script (giọng Tommy) → tải audio.
- [ ] HeyGen render avatar Tommy theo audio đó → tải clip (chấp nhận watermark + 720p ở bản free).

### B4. Bảng chấm điểm case study (lưu lại làm dữ liệu thật)
| Tiêu chí | Điểm/Ghi chú |
|---|---|
| Giọng Việt tự nhiên (1–10) | |
| Lip-sync khớp (1–10) | |
| Sắc thái cảm xúc theo script | |
| Mức edit tay cần thêm | |
| Thời gian làm thủ công | |
| **Kết luận: đủ chuẩn đăng chưa?** | |

**Tiêu chí pass B**: giọng Việt ≥ 7/10 và lip-sync ≥ 7/10. Dưới ngưỡng ⇒ thử voice/model khác (ElevenLabs eleven_v3 / FPT.AI / PlayHT) TRƯỚC khi trả phí.

---

## 4. TRACK C — Bật API trả phí (chỉ khi A ✅ + B ✅)

### C1. Mua & cắm key
- [ ] HeyGen: mua credit pay-as-you-go (số lượng nhỏ trước). ElevenLabs: Starter (có quyền thương mại + instant voice clone).
- [ ] Vào `/settings/integrations` → điền key, `avatarId` (HeyGen), `voiceId` (ElevenLabs). Adapter thật tự kích hoạt thay mock.

### C2. Chạy thật có kiểm soát
- [ ] Bật `RENDER_MODE=live` cho **đúng 1 clip** đầu tiên, xác nhận credit, render, đối chiếu với clip thủ công ở B3.
- [ ] Verify cache hoạt động: render lại cùng script ⇒ KHÔNG tốn thêm credit.
- [ ] Verify usage meter cộng đúng credit.

### C3. Budget ước tính (mỗi 1 chủ đề → 1 video talking-head ~60s)
| Khoản | Ước tính |
|---|---|
| ElevenLabs TTS (~60s) | thấp (trong gói Starter) |
| HeyGen render (~60s) | ~1 credit |
| LLM (Gemini) | $0 |
- [ ] Đặt **trần credit/ngày** tự áp, vượt là dừng.

---

## 5. Ranh giới công cụ (đừng kỳ vọng sai)

HeyGen + ElevenLabs chỉ ra **lớp "người nói trước camera"**. Storyboard đầy đủ còn có B-roll + biểu đồ + text overlay lớn + hiệu ứng zoom — **lớp dựng này tách riêng**:
- Vòng đầu: làm **talking-head thuần**, text overlay bằng CapCut tay.
- Sau: tự động lớp dựng bằng Creatomate (concept C2/C3 đã có khung trong `c2-broll.ts`, `c3-animation.ts`).

---

## 6. Thứ tự thực thi cùng Claude Code

1. **(A1)** Mở rộng schema `TalkingStoryboard` + cập nhật prompt `scripter.ts`. ⟶ Claude Code.
2. **(A4)** Cài cost-guard (cache, mode toggle, retry limit) — làm sớm để không bao giờ lỡ tay tốn credit. ⟶ Claude Code.
3. **(A2/A3)** Test end-to-end mock + siết Auditor. ⟶ Claude Code + Tommy review.
4. **(B)** Song song: Tommy quay footage + thu giọng + render tay 1 clip, điền bảng chấm. ⟶ Tommy.
5. **Gate**: A pass + B pass (giọng ≥7, lip-sync ≥7) ⟶ mới sang C.
6. **(C)** Mua credit, cắm key, render 1 clip thật có kiểm soát, đối chiếu. ⟶ Tommy + Claude Code.

---

## 7. Checklist "Definition of Done" cho lần thử nghiệm đầu

- [ ] Schema `TalkingStoryboard` chạy, Gemini sinh JSON đúng, zod validate pass.
- [ ] Pipeline end-to-end chạy bằng mock, $0.
- [ ] Auditor chặn được script vi phạm trước render.
- [ ] Cost-guard: cache + mode toggle + retry limit + confirm-before-spend hoạt động.
- [ ] Track B: 1 clip talking-head của Tommy, giọng Việt ≥7, lip-sync ≥7, có bảng chấm.
- [ ] Track C: render thật đúng 1 clip, credit đúng dự kiến, cache chặn render lặp.
- [ ] Có case study viết lại: chi phí thật/clip + chất lượng + thời gian.

---

## 8. Rủi ro & phòng ngừa

| Rủi ro | Phòng ngừa |
|---|---|
| Giọng Việt ElevenLabs kém | Test ở Track B trước khi trả phí; fallback eleven_v3 / FPT.AI |
| Lỡ tay đốt credit HeyGen | Cost-guard A4 làm TRƯỚC Track C; mode mặc định mock |
| Gemini trả JSON lệch schema | `responseFormat:json` + zod validate + retry parse 1 lần |
| Compliance (claim lãi suất, so sánh NH) | Auditor chặn cứng trước render |
| Watermark/720p bản free | Chỉ dùng free để chấm chất lượng, không để đăng thật |
| HeyGen+ElevenLabs không ra video hoàn chỉnh | Hiểu rõ ranh giới: lớp dựng tách riêng (CapCut/Creatomate) |
