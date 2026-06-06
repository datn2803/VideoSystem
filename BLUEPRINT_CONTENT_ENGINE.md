# BLUEPRINT — Nâng cấp "bộ não nội dung" (Profile → Plan → Script)

> Mục tiêu: tự động tối đa, anh can thiệp tối thiểu nhưng vẫn sửa/kiểm soát được.
> Tiêu chí: số liệu THẬT có nguồn (không bịa) · chủ đề bám NỖI ĐAU + trend nhưng BỀN VỮNG ·
> đúng chuyên môn nhưng dễ tiếp cận mọi tệp · clip ≤ 90s · chuyên nghiệp như hệ thống thật.
> Research engine: **Gemini Google Search grounding** (đã chốt). Model: **Gemini 2.5 Flash**.

Đây là tài liệu THIẾT KẾ để duyệt trước khi code. Chưa đụng phần render C1/C2/C3 + giọng đọc (đã ổn).

---

## 0. Nguyên tắc kỹ thuật cốt lõi (quyết định toàn bộ kiến trúc)
Trên **Gemini 2.5, grounding (google_search) KHÔNG đi chung với JSON output**. Vì vậy:
- **Bước có grounding → trả TEXT** (research brief có trích nguồn).
- **Bước cần JSON cấu trúc → KHÔNG grounding** (nhận brief text ở trên làm input).

→ Mỗi tầng "thông minh" tách làm 2: **Researcher (grounded, TEXT) → Structurer/Writer (JSON)**.
Đây cũng đúng pattern các hệ thống pro (BRIEFSEEK, sailorworks, smolagents…): *Research → Write → Evaluate*.

---

## 1. Kiến trúc tổng

```
PROFILE (cội nguồn)
  └─[Strategy Agent · JSON, no-grounding]→ brandAngle + channelGoal + 3-5 PILLARS   (anh sửa được)

PLAN (Planner)  — chạy khi bấm "Tạo plan"
  ├─[Trend Researcher · GROUNDED → TEXT]→ "trend brief": trend/tin mới/mùa vụ/nỗi đau + SỐ + nguồn
  └─[Topic Strategist · JSON]→ N chủ đề rải theo pillars, CHẤM ĐIỂM, gắn evergreen/trend, whyNow, dataHook

SCRIPT (Scripter) — chạy khi chọn 1 chủ đề
  ├─[Fact Researcher · GROUNDED → TEXT]→ "fact brief": số liệu THẬT cho chủ đề + nguồn + năm
  ├─[Script Writer · JSON]→ hook/body/cta + data animation, dùng số thật, khung Hook→Problem→Solution→Proof→CTA, ≤90s
  └─[Editor/Auditor · JSON]→ compliance + chấm hook/data/độ dài → pass/fix   (anh duyệt/sửa)
```
Mỗi tầng Agent tự chạy; anh chỉ **duyệt/sửa** ở: pillars, chọn-sửa chủ đề, duyệt script.

---

## 2. Thay đổi DATA MODEL

### 2.1 ProfileRecord (thêm `strategy`, không phá field cũ)
```ts
type ContentPillar = {
  name: string;            // "Vay mua nhà thông minh"
  description: string;     // 1 câu
  painPoints: string[];    // nỗi đau trụ giải quyết
  sampleAngles: string[];  // 2-3 góc khai thác gợi ý
};
strategy?: {
  brandAngle: string;      // định vị riêng ("vì sao là anh")
  channelGoal: "uy tín" | "lead" | "bán" | string;
  pillars: ContentPillar[];
  generatedAt: string;
};
```

### 2.2 ContentTopic (mở rộng — thêm scoring + grounding refs)
```ts
type ContentTopic = {
  topic: string; hook: string; target_persona: string; pain_point: string;
  format_hint: "educate" | "story" | "cta" | "mythbust" | "listicle" | "news";
  pillar: string;                       // thuộc trụ nào
  contentType: "evergreen" | "trend";   // để giữ tỉ lệ ~70/30
  whyNow: string;                       // vì sao nên làm bây giờ (trend/mùa vụ)
  dataHook: string;                     // số liệu/góc data định dùng (điểm tựa cho Scripter)
  scores: { demand: number; virality: number; relevance: number; total: number }; // 1-5
  sources?: { title: string; url: string }[];  // dẫn nguồn (nếu trend)
};
```
> `priority` cũ → thay bằng `scores.total` (chấm theo nhu cầu thật, không đoán).

### 2.3 ScriptResult (thêm nguồn)
```ts
sources?: { claim: string; url: string; year?: string }[]; // số liệu nào lấy từ đâu
```
> Có nguồn thật → bỏ ép "ví dụ/ước tính" cho số đã dẫn chứng; chỉ gắn nhãn cho số nào model tự suy.

---

## 3. Adapter Gemini — thêm hỗ trợ GROUNDING (kỹ thuật)
Hiện `complete()` không có grounding. Thêm:
```ts
complete({ ..., grounded?: boolean })
// nếu grounded === true:
//   - body.tools = [{ google_search: {} }]
//   - KHÔNG set responseMimeType=json  (2.5 không cho gộp)
//   - trả về { text, citations } — đọc từ candidates[0].groundingMetadata.groundingChunks[].web {uri,title}
```
Các bước Researcher gọi `grounded:true`; các bước Writer/Structurer gọi như cũ (`responseFormat:"json"`).

---

## 4. PHẦN 1 — Strategy Agent (Profile → Pillars)  [JSON · no-grounding]
**Khi nào chạy:** ngay sau khi tạo profile (tự động). Anh xem & sửa / "Tạo lại trụ".
**Vì sao không grounding:** pillars là chủ đề chiến lược ổn định, suy từ profile là đủ; để dành grounding cho Planner.

**Prompt (skeleton):**
```
SYSTEM: Bạn là content strategist xây thương hiệu cá nhân ngành {industry} tại VN.
Mục tiêu: thương hiệu BỀN VỮNG, đúng chuyên môn nhưng dễ tiếp cận MỌI tệp, mọi nội dung bám NỖI ĐAU.
USER: Profile {name, role, products, audience.segment, audience.painPoints, audience.goals, tone, usp}
Rút ra: 1) brandAngle (1 câu định vị) 2) channelGoal (uy tín/lead/bán)
3) pillars: 3-5 trụ {name ≤6 từ, description, painPoints, sampleAngles 2-3}
Ràng buộc: phủ hết sản phẩm + nỗi đau chính; trụ không trùng; diễn đạt phổ thông. CHỈ JSON.
```
**Ví dụ (Personal Banker của anh):** brandAngle "PB minh bạch — nhìn TỔNG chi phí vay, không mắc bẫy lãi mồi"; goal "uy tín→lead"; 4 trụ: *Vay mua nhà thông minh · Tránh bẫy tài chính · Tiết kiệm & dòng tiền · Lộ trình mua nhà 3-5 năm*.

**Acceptance:** tạo profile → hiện 4 trụ hợp lý trong ≤10s; sửa/regenerate được.

---

## 5. PHẦN 2 — Planner (Pillars → Topics có chấm điểm)

### 5a. Trend Researcher  [GROUNDED → TEXT]
**Prompt:**
```
SYSTEM: Bạn là nhà nghiên cứu xu hướng nội dung tài chính VN. Chỉ dùng thông tin TÌM ĐƯỢC, ghi nguồn.
USER: Hôm nay {date}. Lĩnh vực {industry}, audience {segment}, nỗi đau {painPoints}, trụ {pillars}.
Tìm (ưu tiên nguồn VN: báo lớn, SBV/GSO, diễn đàn): 
- xu hướng/tin tài chính MỚI 30 ngày qua liên quan các trụ
- mùa vụ/thời điểm (vd cuối năm, mùa vay mua nhà)
- nỗi đau/câu hỏi audience đang bàn (Reddit/Facebook/Voz/diễn đàn)
- 5-8 số liệu THẬT (kèm năm + nguồn)
Trả TEXT có gạch đầu dòng + [nguồn](url) sau mỗi ý.
```
→ Output: "trend brief" (text + nguồn). Không JSON.

### 5b. Topic Strategist  [JSON · no-grounding]
**Prompt:**
```
SYSTEM: Content strategist. Xây thương hiệu BỀN VỮNG, bám nỗi đau, dễ tiếp cận mọi tệp.
USER: Profile + pillars + TREND BRIEF (dán nguyên văn ở trên).
Sinh {N} chủ đề video ngắn, RẢI ĐỀU theo các trụ, TỈ LỆ ~70% evergreen / 30% trend.
Mỗi chủ đề: {topic ≤15 từ, hook ≤20 từ, target_persona, pain_point, pillar, contentType,
  format_hint, whyNow, dataHook (số/góc data sẽ dùng), sources (nếu trend),
  scores{demand,virality,relevance 1-5, total}}.
Chấm điểm THẬT: demand = nỗi đau/độ tìm kiếm trong brief; virality = sốc/tò mò; relevance = hợp trụ+thương hiệu.
CHỈ JSON array, sắp theo scores.total giảm dần.
```
→ App hiện danh sách chủ đề đã chấm điểm; anh chọn cái muốn làm (hoặc sửa).

**Acceptance:** 12 chủ đề bám trụ, có whyNow + dataHook + điểm; ≥3 chủ đề "trend" có nguồn thật mới.

---

## 6. PHẦN 3 — Scripter (Topic → Script)

### 6a. Fact Researcher  [GROUNDED → TEXT]
```
SYSTEM: Nhà nghiên cứu số liệu tài chính VN. Chỉ nêu số TÌM ĐƯỢC + nguồn + năm. Không bịa.
USER: Chủ đề "{topic}", góc data "{dataHook}", audience {segment}.
Tìm 5-8 số liệu/ví dụ THẬT, mới, ưu tiên VN (kèm năm + [nguồn]). Nêu 1-2 con số gây sốc làm hook.
Trả TEXT gạch đầu dòng + nguồn.
```

### 6b. Script Writer  [JSON · no-grounding]
```
SYSTEM: Biên kịch short-form tài chính VN số 1. Tone chuyên nghiệp + gần gũi.
Tuyệt đối không hứa lợi nhuận/“an toàn 100%”/so sánh tiêu cực NH khác.
USER: Profile + FACT BRIEF (dán) + chủ đề.
Viết theo khung: HOOK (≤3s, từ 1 trong 5 mẫu: số sốc/phản trực giác/sai lầm/câu hỏi/bí mật)
→ VẤN ĐỀ/why-now → 3-4 Ý (mỗi ý GẮN 1 SỐ THẬT từ brief) → BẰNG CHỨNG → CTA loop.
RÀNG BUỘC ĐỘ DÀI: read script (hook+body+cta) ≤ {wordBudget} từ (≤90s).
Chỉ dùng số có trong FACT BRIEF; số nào tự suy phải ghi "ước tính".
Trả JSON theo schema ScriptResult hiện tại (+ sources). Phần animation data lấy số từ brief.
```
> `wordBudget`: 90s ≈ ~200-230 từ; 60s ≈ ~150; 30s ≈ ~80. (đòn bẩy độ dài THẬT, thay cho "giây".)

### 6c. Editor/Auditor  [JSON]  (nâng cấp `auditScript` sẵn có)
```
Kiểm: 1) compliance ngân hàng (giữ luật cũ) 2) chấm hook (1-5), mật độ data (mỗi ý có số?),
độ dài (đếm từ ≤ budget?), tính dễ tiếp cận. Nếu < ngưỡng → trả gợi ý sửa cụ thể.
```
→ pass → lưu; fail → hiện issue, anh sửa/Writer tự sửa 1 vòng.

---

## 7. Models · Cost · Latency
- **Gemini 2.5 Flash** cho Researcher (grounding+suy luận) + Writer. Strategy/Topic/Editor có thể Flash-Lite để rẻ (đổi qua config).
- **Grounding**: 1.500 lượt/ngày FREE (tier trả phí), sau đó $35/1k. Vài video/ngày → gần như free.
- **Latency thêm**: Plan +~10-15s (1 grounded), Script +~10-15s (1 grounded). Chấp nhận được.

## 8. Chống bịa · Automation · Override · (tương lai) học dần
- Số liệu THẬT từ grounding + lưu `sources` → minh bạch, chống bịa. Writer chỉ dùng số trong brief.
- Mọi tầng tự chạy; anh override ở: **sửa pillars · chọn/sửa chủ đề · duyệt/sửa script**.
- (Phase sau) lưu lựa chọn duyệt/sửa của anh → đưa vào prompt lần sau (giống ContentPilot "học dần").

## 9. Thứ tự triển khai (làm lần lượt, có nghiệm thu từng phần)
1. **Adapter grounding** (nền tảng cho Part 2-3) — nhỏ, làm trước.
2. **Part 1 — Profile + Strategy Agent (pillars).** Nghiệm thu: tạo profile → ra 4 trụ, sửa được.
3. **Part 2 — Planner (Trend Researcher + Topic Strategist scoring).** Nghiệm thu: 12 chủ đề chấm điểm, có trend thật.
4. **Part 3 — Scripter (Fact Researcher + Writer + Editor).** Nghiệm thu: script ≤90s, số thật có nguồn, hook mạnh.
5. Tinh chỉnh prompt theo kết quả thực tế.

## 10. Nguồn tham khảo
- Pattern hệ thống thật: sailorworks/video-content-agent (trùng stack), BRIEFSEEK, ContentPilot, smolagents-video-script-generator.
- Khung script: Hook→Problem→Solution→Proof (clipshort, virvid); giáo dục +40% engagement.
- Ideation/chấm điểm: youtie "risk radar", descript "trend lab", multi-media.cloud (finance signals).
- Grounding/giá: ai.google.dev/gemini-api/docs/google-search; pricing $35/1k + 1500/ngày free.
