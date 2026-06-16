import { hub } from "@/lib/integration-hub/hub";
import { type ProfileRecord } from "@/lib/integration-hub/storage";
import { recordLLMUsage } from "@/lib/agents/usage";
import { groundedNoSourceWarning } from "@/lib/agents/grounding-util";
import { validate, type ContentGraph, type Node as GraphNode, type Edge as GraphEdge } from "@/lib/content-graph";

export type ScriptResult = {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  variantPrompts: {
    talking: string;
    broll: { shotList: { footageTag: string; durationSec: number; note: string }[]; voiceOver: string };
    animation: {
      keyMessages: string[];
      dataPoints: string[];
      visualCues: string[];
      voiceOver: string;
      // C3 v4.1 — nội dung RIÊNG cho từng archetype bento (tuỳ chọn → backward-compat).
      // PHẦN D4: displaySource?: nguồn NGẮN (vd 'VnExpress 2025') hiện dòng nhỏ dưới cảnh data; số
      // không có nguồn (ước tính/ví dụ) → để trống.
      heroSubject?: string;
      bigStat?: { value: string; unit: string; label: string; displaySource?: string };
      bars?: { label: string; value: string; unit: string }[];
      pills?: { text: string }[];
      compare?: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] };
      principle?: string;
      callout?: string;
      // C3 v5 — data-viz đa dạng (số chạy, NON-READ minh hoạ body). Tuỳ chọn → backward-compat.
      donut?: { value: string; unit: string; label: string; displaySource?: string };
      beforeAfter?: { fromValue: string; fromLabel: string; toValue: string; toLabel: string; unit: string; displaySource?: string };
      miniStats?: { value: string; unit: string; label: string }[];
      trend?: { label: string; points: string[]; displaySource?: string };
      // C3 v2 — sơ đồ QUY TRÌNH (pills dọc + mũi tên). 2-4 bước NGẮN. Tuỳ chọn → backward-compat.
      flow?: { title?: string; steps: string[] };
      // C3 v2 — POINT SCENES giàu data: mỗi điểm = thẻ HƯỚNG DẪN (tiêu đề bước + cách làm + số liệu hỗ trợ).
      // = bản giàu của keyMessages (point i ↔ ý i của body). Tuỳ chọn → builder fallback keyMessages khi thiếu.
      points?: { title: string; detail?: string; stat?: { value: string; unit: string; label: string } }[];
    };
  };
  estimatedDurationSec: number;
  sources?: { claim: string; url: string; year?: string }[]; // nguồn số liệu thật (từ Fact Researcher grounded)
  /**
   * Storyboard chuẩn content-graph (Phase 1 đại tu render) — sinh BÊN CẠNH
   * variantPrompts (đường render cũ giữ nguyên 100%). Optional: script cũ /
   * model không sinh được → undefined, mọi thứ vẫn chạy như trước.
   * Node thứ tự = thứ tự giọng đọc; scene-planner topoSort ra ScenePlan.
   */
  storyboard?: ContentGraph;
  costUsd: number;
};

// PHẦN D — Writer prompt (PROMPTS_SCRIPT_ENGINE #2): CONCRETE + ĐA DẠNG mọi content. Dùng nháy đơn
// trong ví dụ để không vỡ chuỗi template. Compliance ngân hàng cũ GIỮ ở cuối (additive, CLAUDE.md).
const SYSTEM = `Bạn là biên kịch video ngắn (TikTok/Reels) tiếng Việt số 1 — vừa HẤP DẪN vừa CHÍNH XÁC.
Viết kịch bản ĐỌC (read-script) + dữ liệu dựng hình, theo chủ đề và FACT BRIEF cho sẵn.

QUY TẮC CỨNG (không vi phạm):
1) ĐỘ DÀI: read-script (hook+body+cta) ≤ 90 giây = wordBudget từ (caller truyền). Nhắm SÁT trần để tối đa thông tin. Tự đếm từ; KHÔNG vượt.
2) HOOK ≤ 3 giây (1-2 câu đầu): mở bằng MỘT trong các kiểu — số sốc THẬT / câu hỏi nhức nhối / khẳng định phản trực giác / vào thẳng tình huống. CẤM chào hỏi, CẤM 'hôm nay mình nói về…', CẤM định nghĩa lề mề.
3) CỤ THỂ — CẤM CHUNG CHUNG: mọi danh từ chung phải cụ thể hoá (tên thật, con số, ví dụ). CẤM cụm sáo rỗng nếu không kèm dẫn chứng: 'giải pháp hữu hiệu', 'tối ưu công việc', 'vô cùng quan trọng', 'thay đổi cuộc chơi', 'bùng nổ'. MỖI ý chính phải có 1 VÍ DỤ NHỎ dễ hiểu HOẶC 1 SỐ THẬT.
4) SỐ LIỆU & NGUỒN: chỉ dùng số CÓ trong FACT BRIEF. Mỗi số/khẳng định quan trọng kèm displaySource ngắn (vd 'VnExpress 2025') + ghi vào mảng sources {claim,url,year}. Số tự suy/minh hoạ (không có trong brief) PHẢI ghi '(ước tính)' hoặc '(ví dụ)'. TUYỆT ĐỐI không bịa số.
5) NHỊP: 1 ý / 1 cảnh; mỗi 3-5 giây có điểm mới; kết mạnh (peak-end) rồi CTA.
6) TONE — chọn hợp chủ đề/ngành (KHÔNG cố định): tài chính/nghiêm túc → điềm đạm, uy tín; công cụ/AI/công nghệ → năng động, hào hứng; sức khoẻ/đời sống → gần gũi, ấm. Luôn nói như người đi làm có kinh nghiệm: câu ngắn, đọc lên nghe tự nhiên, không dịch sượng, không trang trọng quá.
7) CTA: 1 lời kêu gọi RÕ, 1 hành động — chọn hợp mục tiêu video (comment 1 từ khoá / follow / nhắn tin).
8) Nhiều người xem KHÔNG bật tiếng → ý then chốt phải nằm ở phần hiện hình (keyMessages/data), không chỉ trong lời.

CHỌN KHUNG theo format_hint (caller truyền; rỗng → tự chọn khung HỢP NHẤT với chủ đề):
- listicle ('Top N'): mỗi mục = Tên cụ thể + Cách chạy (1 câu) + Ví dụ nhỏ + 1 số thật (kèm nguồn).
- story: nhân vật/tình huống thật → xung đột → bước ngoặt (số/bài học) → chốt.
- mythbust: 'Nhiều người tưởng X' → sự thật + bằng chứng số → điều ĐÚNG nên làm.
- how-to: 3-4 bước NGẮN, mỗi bước 1 hành động cụ thể + mẹo/số.
- news: chuyện gì + MỚI cỡ nào (ngày/số) + vì sao liên quan người xem + góc nhìn.
- compare: A vs B trên 2-3 tiêu chí cụ thể (số) → nên chọn gì.
KHUNG CHUNG mọi loại: Hook → Bối cảnh/why-now → LÕI (theo format) → Bằng chứng (số+nguồn) → CTA.

ĐẦU RA: CHỈ JSON theo schema (caller cấp schema chi tiết). Trong CHUỖI dùng nháy đơn '…' thay nháy kép (tránh vỡ JSON).
- animation + storyboard: số liệu LẤY TỪ FACT BRIEF; mỗi cảnh data kèm displaySource (chuỗi nguồn ngắn).
- storyboard nodes đa dạng (data-big/donut/data-bars/trend/before-after/mini/pills/compare/flow) đúng số thật.

COMPLIANCE (GIỮ — chủ đề tài chính/ngân hàng): TUYỆT ĐỐI không hứa lợi nhuận cụ thể, không nói 'an toàn 100%', không so sánh tiêu cực với đối thủ.`;

function buildPrompt(
  profile: ProfileRecord,
  topic: string,
  pain: string,
  persona: string,
  lengthSec: number,
  wordBudget: number,
  factBrief: string,
  formatHint: string,
  dataHook: string
): string {
  const factSection = factBrief.trim()
    ? `\nFACT BRIEF (số liệu nghiên cứu — ƯU TIÊN dùng các số trong đây; số nào KHÔNG có trong brief mà tự suy thì PHẢI ghi "ước tính"/"ví dụ"):\n"""\n${factBrief.trim()}\n"""\n`
    : `\n(Không có fact brief số liệu thật — số nào đưa ra phải gắn nhãn "ước tính"/"ví dụ", TUYỆT ĐỐI không bịa trích dẫn nghiên cứu.)\n`;
  return `Profile: tên ${profile.name}, vai trò ${profile.role || "chuyên gia"}, sản phẩm ${(profile.expertise?.products || []).join(", ") || "N/A"}, đối tượng ${persona}, tone gợi ý ${profile.tone?.voice || "tự chọn theo chủ đề"}, USP ${profile.usp || "N/A"}.
Chủ đề: ${topic}
format_hint: ${formatHint || "(tự chọn khung HỢP NHẤT với chủ đề: listicle/story/mythbust/how-to/news/compare)"}
Góc data: ${dataHook || pain || topic}
Nỗi đau: ${pain}
${factSection}
Ngân sách từ: ${wordBudget} (≈ ${lengthSec}s, nhắm SÁT 90s để tối đa thông tin — KHÔNG vượt).
Viết kịch bản theo ĐÚNG quy tắc cứng + khung của format_hint (Hook ≤3s → bối cảnh/why-now → LÕI theo format → bằng chứng số+nguồn → CTA). 1 ý/cảnh; ý then chốt hiện ở keyMessages/data (sound-off).

⚠ ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC — sai là HỎNG cả hệ thống):
- Trả về DUY NHẤT 1 JSON object hợp lệ. KHÔNG kèm bất kỳ chữ nào trước/sau, KHÔNG markdown, KHÔNG giải thích, KHÔNG ghi suy nghĩ.
- Trong MỌI giá trị chuỗi: TUYỆT ĐỐI KHÔNG dùng dấu ngoặc kép " (sẽ làm vỡ JSON). Cần nhấn mạnh thì dùng nháy đơn 'như vầy' hoặc viết thường.
Schema:
{
  "hook": "câu mở 3-5s (≤25 từ, phải gây stop scroll)",
  "body": "nội dung chính, dạng đoạn văn, ${Math.round(lengthSec * 0.7)} giây",
  "cta": "call-to-action 5-10s (mời comment/follow, không spam)",
  "caption": "caption post social, có line break, có emoji vừa phải",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "variantPrompts": {
    "talking": "script đầy đủ cho AI avatar (hoặc người thật) đọc trực tiếp camera",
    "broll": {
      "shotList": [
        {"footageTag": "intro|talking|broll|cta|outro", "durationSec": 3, "note": "mô tả shot"}
      ],
      "voiceOver": "voice-over text cho video b-roll"
    },
    "animation": {
      "keyMessages": ["4-5 ý cốt lõi của BODY theo ĐÚNG THỨ TỰ giọng đọc (mỗi ý = 1 cảnh; tóm tắt NGẮN ý đó trong body)"],
      "dataPoints": ["3-5 số liệu MINH HOẠ có ngữ cảnh, GHI RÕ tính ví dụ (vd 'ví dụ tiết kiệm ~8 tiếng/tuần', 'thường giảm ~30% chi phí')"],
      "visualCues": ["gợi ý icon"],
      "voiceOver": "(KHÔNG dùng để đọc — C3 đọc CHUNG read script hook+body+cta. Để '' )",
      "heroSubject": "1 cụm NGẮN mô tả nhân vật/chủ thể minh hoạ 3D (vd 'trợ lý AI cho founder')",
      "bigStat": {"value": "80", "unit": "%", "label": "NHÃN NGẮN (vd 'ƯỚC TÍNH TIẾT KIỆM')", "displaySource": "nguồn ngắn vd 'VnExpress 2025' — để '' nếu là ước tính/ví dụ"},
      "bars": [{"label": "Cách cũ", "value": "30", "unit": "%"}, {"label": "Với AI", "value": "75", "unit": "%"}, {"label": "Tối ưu", "value": "90", "unit": "%"}],
      "pills": [{"text": ".."}, {"text": ".."}, {"text": ".."}, {"text": ".."}],
      "compare": {"leftTitle": "Cách cũ", "leftItems": ["..", ".."], "rightTitle": "Với AI", "rightItems": ["..", ".."]},
      "principle": "1 câu nguyên tắc cốt lõi đắt giá (≤12 từ)",
      "callout": "1 insight nhấn mạnh (≤16 từ)",
      "donut": {"value": "70", "unit": "%", "label": "NHÃN NGẮN (số % KHÁC bigStat)", "displaySource": "nguồn ngắn hoặc '' nếu ước tính"},
      "beforeAfter": {"fromValue": "8", "fromLabel": "Cách cũ", "toValue": "1", "toLabel": "Với AI", "unit": "giờ", "displaySource": "nguồn ngắn hoặc ''"},
      "miniStats": [{"value": "3", "unit": "x", "label": "Nhanh hơn"}, {"value": "60", "unit": "%", "label": "Tiết kiệm"}, {"value": "24", "unit": "/7", "label": "Hoạt động"}, {"value": "5", "unit": "phút", "label": "Cài đặt"}],
      "trend": {"label": "Tăng trưởng", "points": ["20", "45", "70", "95"], "displaySource": "nguồn ngắn hoặc ''"},
      "flow": {"title": "QUY TRÌNH", "steps": ["Bước 1 ngắn", "Bước 2 ngắn", "Bước 3 (đích)"]},
      "points": [{"title": "Tên bước NGẮN (≤7 từ)", "detail": "Cách làm/giải thích cụ thể DẠY người xem (≤22 từ)", "stat": {"value": "60", "unit": "%", "label": "nhãn ngắn (ví dụ)"}}]
    }
  },
  "estimatedDurationSec": ${lengthSec},
  "storyboard": {
    "schemaVersion": 1,
    "intent": "explainer",
    "synopsis": "1 câu tóm video",
    "nodes": [
      {"id": "hook", "kind": "text", "text": "= hook ở trên", "frameIntent": "hook", "durationSec": 4},
      {"id": "diem_1", "kind": "text", "text": "ý 1 của body (NGẮN)", "frameIntent": "point", "durationSec": 5},
      {"id": "so_lieu_1", "kind": "data", "label": "nhãn số (ví dụ)", "data": {"value": "65", "unit": "%", "label": "nhãn (ví dụ)"}, "frameIntent": "data-big", "durationSec": 4},
      {"id": "ti_le_1", "kind": "data", "data": {"value": "72", "unit": "%", "label": "tỉ lệ (ví dụ)"}, "frameIntent": "donut", "durationSec": 4},
      {"id": "cot_1", "kind": "data", "label": "so sánh (ví dụ)", "data": {"bars": [{"label": "Cũ", "value": "40", "unit": "giờ"}, {"label": "Mới", "value": "8", "unit": "giờ"}]}, "frameIntent": "data-bars", "durationSec": 4},
      {"id": "cta", "kind": "text", "text": "= cta ở trên", "frameIntent": "outro", "durationSec": 4}
    ],
    "edges": [
      {"from": "hook", "to": "diem_1", "kind": "sequence"},
      {"from": "diem_1", "to": "so_lieu_1", "kind": "sequence"},
      {"from": "so_lieu_1", "to": "ti_le_1", "kind": "sequence"},
      {"from": "ti_le_1", "to": "cot_1", "kind": "sequence"},
      {"from": "cot_1", "to": "cta", "kind": "sequence"}
    ]
  }
}

QUY TẮC trường animation (QUYẾT ĐỊNH SỐ CẢNH + data motion — làm ĐẦY ĐỦ):
- ⚠ HÌNH C3 chạy KHỚP GIỌNG ĐỌC (đọc hook+body+cta). keyMessages PHẢI là các ý của BODY theo
  ĐÚNG THỨ TỰ giọng đọc (keyMessage i hiện đúng lúc giọng đọc tới ý đó). dataPoints/bars MINH HOẠ
  cho chính các ý đó — KHÔNG lạc đề, không thêm ý không có trong lời đọc.
- keyMessages: 4-5 ý RIÊNG BIỆT (mỗi ý thành 1 cảnh) → đủ cảnh, video không bị ít cảnh.
- bigStat + bars + donut + trend + dataPoints (phần "data motion" chạy số): ƯU TIÊN số THẬT từ FACT BRIEF nếu có
  (số thật → KHÔNG ghi "ví dụ", dùng đúng con số + ngữ cảnh trong brief). CHỈ khi fact brief KHÔNG có/không hợp →
  điền số MINH HOẠ hợp lý theo chủ đề + GHI RÕ "ví dụ"/"ước tính" ở nhãn. TUYỆT ĐỐI KHÔNG bịa trích dẫn nghiên cứu (không "theo Gartner/McKinsey...").
- bars: 2-4 mục CÙNG ĐƠN VỊ để so sánh được (vd cùng "%"), giá trị KHÁC nhau.
- compare: 2 cột cụ thể (cũ vs mới); pills: 4 điểm NGẮN (≤8 từ) khác nhau.
- pills/compare/principle/callout RIÊNG BIỆT, không lặp keyMessages.
- ĐA DẠNG data-viz (số chạy): điền donut (1 vòng % khác bigStat), beforeAfter (số trước→sau, vd '8 giờ→1 giờ'),
  miniStats (3-4 chỉ số nhỏ khác nhau), trend (4-5 số tăng dần). TẤT CẢ là MINH HOẠ (ví dụ/ước tính), bám
  CHỦ ĐỀ + các ý trong body, KHÔNG lạc đề, KHÔNG bịa trích dẫn. Cái nào không hợp chủ đề thì để rỗng/bỏ.
- flow: CHỈ điền khi chủ đề có QUY TRÌNH/CÁC BƯỚC rõ (how-to, lộ trình, cách làm). 2-4 bước NGẮN (≤6 từ/bước),
  bước CUỐI = kết quả/đích. Chủ đề không có quy trình → BỎ TRỐNG (đừng gượng ép).
- ⭐ points (QUAN TRỌNG — đây là phần DẠY KIẾN THỨC chính, mỗi point = 1 CẢNH thẻ hướng dẫn): điền 3-4 thẻ,
  point i ↔ keyMessages[i] (CÙNG ý, CÙNG thứ tự giọng đọc body). Mỗi thẻ gồm:
    • title: tên bước/ý NGẮN (≤7 từ) — chính là ý đó của body.
    • detail: CÁCH làm hoặc giải thích CỤ THỂ, dạy người xem điều hữu ích THẬT (≤22 từ). KHÔNG chung chung,
      KHÔNG lặp lại y nguyên title — phải thêm thông tin (cách làm, lý do, con số, hệ quả).
    • stat: 1 số HỖ TRỢ cho bước đó (value+unit+label NGẮN). ƯU TIÊN số THẬT từ FACT BRIEF; không có → số minh hoạ
      hợp lý + nhãn ghi "ví dụ"/"ước tính". MỖI stat phải KHÁC nhau và bám đúng bước (vd bước tiết kiệm thời gian →
      số giờ; bước chi phí → %/tiền). TUYỆT ĐỐI không bịa trích dẫn nghiên cứu.
  → points giàu thông tin = video DẠY được kiến thức (đúng mục tiêu). Vẫn PHẢI điền keyMessages (đồng bộ với points).
- ⚠ hook/body/cta/voiceOver GIỮ NGẮN GỌN như cũ — KHÔNG vì thêm data mà viết dài ra (tránh video bị dài).

QUY TẮC trường storyboard (xương sống cảnh — content-graph):
- nodes theo ĐÚNG THỨ TỰ giọng đọc: hook → mỗi ý body 1 node text (point i ↔ keyMessages[i]) xen kẽ
  node data cho số liệu minh hoạ ý đó → cta. Tổng 5-9 node. id snake_case KHÔNG TRÙNG, không dấu.
- node text: text NGẮN (≤20 từ). node data: ƯU TIÊN số THẬT từ FACT BRIEF;
  không có số thật → label/nhãn PHẢI chứa 'ví dụ' hoặc 'ước tính' (anti-fabrication). Không có số nào → BỎ node data.
- frameIntent gợi ý loại cảnh: hook|point|data-big|data-bars|donut|trend|before-after|mini|pills|compare|flow|quote|principle|outro.
- ⭐ GIÀU DATA-VIZ (QUAN TRỌNG — để cảnh graph động như bản cũ): ĐƯA các số đã sinh ở trường "animation"
  (bigStat/donut/bars/trend/beforeAfter/miniStats/pills/compare/flow/principle/callout) THÀNH node data
  storyboard TƯƠNG ỨNG — CÙNG SỐ, KHÔNG bịa thêm. Mỗi loại = 1 node data, frameIntent + shape data:
    • data-big {value,unit,label} · donut {value,unit,label} · data-bars {bars:[{label,value,unit}]}
    • trend {label,points:["10","22","38"]} · before-after {fromValue,fromLabel,toValue,toLabel,unit}
    • mini {title,stats:[{value,unit,label}]} · pills {title,items:["…","…"]}
    • compare {leftTitle,leftItems,rightTitle,rightItems} · flow {title,steps:["…"]} · principle (node text)
  Xen node data giữa các node point theo đúng thứ tự đọc. Loại nào KHÔNG hợp chủ đề → BỎ (đừng gượng ép).
  ⭐ NGUỒN trên cảnh data: node data có SỐ THẬT (có nguồn trong FACT BRIEF) → THÊM "displaySource" (vd
  'VnExpress 2025') vào data của node đó (vd data:{value,unit,label,displaySource}). Số ước tính/ví dụ
  (không nguồn) → KHÔNG đặt displaySource. Đây là dòng nguồn nhỏ hiện dưới cảnh data trên video.
- durationSec mỗi node 3-8; TỔNG ≈ ${lengthSec}s.
- edges: CHỈ "sequence" nối node liền kề theo thứ tự đọc (n-1 edge cho n node). KHÔNG cycle, không self-edge.`;
}

// ── Fact Researcher (GROUNDED → TEXT có nguồn) ──
// Tìm số liệu THẬT cho chủ đề. Best-effort: hỏng/không-grounding → brief rỗng/cảnh báo, KHÔNG phá việc viết script.
async function runFactResearcher(
  profile: ProfileRecord,
  topic: string,
  dataHook: string | undefined,
  pain: string,
  model: string
): Promise<{ brief: string; sources: { title: string; url: string }[]; costUsd: number }> {
  const llm = await hub.llm();
  // PHẦN C — date-aware + nguồn VN + mỗi dữ kiện kèm năm + URL (PROMPTS_SCRIPT_ENGINE #1).
  const now = new Date();
  const date = `ngày ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
  const system = `Bạn là nhà nghiên cứu dữ liệu cho video ngắn tiếng Việt. Hôm nay là ${date}.
Chỉ dùng thông tin TÌM ĐƯỢC qua tìm kiếm — TUYỆT ĐỐI không bịa, không suy đoán.
Nhiệm vụ: với chủ đề + góc data cho trước, tìm 6-8 dữ kiện THẬT, MỚI NHẤT (ưu tiên trong 12 tháng),
hữu ích cho người Việt.
- Ưu tiên nguồn VN uy tín: VnExpress, Tuổi Trẻ, VietnamNet, CafeF, Thanh Niên; số liệu chính thống GSO/SBV;
  hoặc trang sản phẩm/chính chủ. Nguồn quốc tế chỉ khi không có nguồn VN.
- MỖI dữ kiện ghi rõ: con số/sự thật cụ thể + NĂM + [nguồn](url đầy đủ).
- Nếu chủ đề về công cụ/sản phẩm/tool: nêu TÊN THẬT cụ thể + nó làm gì (1 câu) + 1 ví dụ dùng thực tế.
- Đánh dấu 1-2 con số GÂY SỐC nhất (gắn nhãn [HOOK]) để mở đầu video.
Trả về TEXT gạch đầu dòng. KHÔNG trả JSON.`;
  const user = `Chủ đề: ${topic}
Góc data muốn khai thác: ${dataHook || pain || topic}
Đối tượng: ${profile.audience?.segment || "người Việt quan tâm chủ đề này"}
Nỗi đau: ${pain || "N/A"}
Tìm 6-8 dữ kiện thật MỚI NHẤT kèm năm + nguồn (ưu tiên VN). Nêu tên công cụ/sản phẩm THẬT nếu hợp.
Đánh dấu [HOOK] cho 1-2 số sốc.`;
  try {
    const r = await llm.complete({
      model, // B2: Gemini 3.1 Pro (grounded + chất lượng) — từ config Integration Hub
      system,
      messages: [{ role: "user", content: user }],
      grounded: true,
      maxTokens: 1536,
    });
    await recordLLMUsage(r.costUsd, r.tokensIn, r.tokensOut);
    const sources = r.citations ?? [];
    let brief = r.text || "";
    const warning = brief ? groundedNoSourceWarning(r) : "";
    if (warning) brief = `${warning}\n\n${brief}`;
    return { brief, sources, costUsd: r.costUsd };
  } catch (e) {
    console.error("[scripter] Fact Researcher lỗi (bỏ qua, viết script không có brief):", e);
    return { brief: "", sources: [], costUsd: 0 };
  }
}

// ~2.5 từ/giây đọc TV → 60s≈150, 90s≈225 từ. TRẦN CỨNG 90s (kẹp lengthSec ≤ 90) — blueprint D0
// "nhắm 210-230 từ, trần cứng 90s": video dài hơn vẫn chỉ ~225 từ read-script.
export function wordBudgetFor(lengthSec: number): number {
  return Math.max(60, Math.round(Math.min(90, lengthSec) * 2.5));
}

// Parse JSON script CHẮC TAY: bóc markdown fence, cắt phần thừa TRƯỚC `{` / SAU `}` (thinking/prose
// rò ra), thử vá trailing comma. Trả null nếu bất lực → caller retry / báo lỗi (KHÔNG đổ raw vào body).
export function parseScriptJson(text: string): Partial<ScriptResult> | null {
  if (!text) return null;
  let s = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  s = s.slice(first, last + 1);
  for (const cand of [s, s.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const obj = JSON.parse(cand);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Partial<ScriptResult>;
    } catch {
      /* thử bản kế */
    }
  }
  return null;
}

// Nhãn anti-fab hợp lệ trên label số liệu (đã có nguồn thật thì không cần).
const ESTIMATE_RE = /ước tính|ví dụ|minh hoạ|minh họa|tham khảo|~/i;

/**
 * Làm sạch storyboard LLM trả về thành ContentGraph hợp lệ (best-effort):
 * - ép schemaVersion/intent/kind hợp lệ, lọc node thiếu id, khử id trùng;
 * - bỏ edge trỏ node không tồn tại / self-edge; thiếu edges → tự nối sequence theo thứ tự node;
 * - ANTI-FAB: node data có số mà KHÔNG có nguồn thật (hasSources=false) và label thiếu
 *   nhãn 'ước tính/ví dụ' → TỰ THÊM '(ước tính)' vào label (đường hiển thị nào dùng graph
 *   cũng được gắn nhãn từ gốc);
 * - validate() cuối — invalid → null (script vẫn dùng được, chỉ mất storyboard).
 */
export function sanitizeStoryboard(raw: unknown, hasSources: boolean): ContentGraph | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const intents = new Set(["single-frame", "explainer", "data-viz", "promo", "comparison", "other"]);
  const intent = intents.has(String(r.intent)) ? (String(r.intent) as ContentGraph["intent"]) : "explainer";

  const rawNodes = Array.isArray(r.nodes) ? r.nodes : [];
  const seen = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const n of rawNodes) {
    if (!n || typeof n !== "object") continue;
    const o = n as Record<string, unknown>;
    let id = String(o.id || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!id) continue;
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    const base = {
      id,
      label: o.label != null ? String(o.label).slice(0, 60) : undefined,
      frameIntent: o.frameIntent != null ? String(o.frameIntent).slice(0, 24) : undefined,
      durationSec: Number.isFinite(Number(o.durationSec)) && Number(o.durationSec) > 0
        ? Math.min(15, Math.max(1, Number(o.durationSec)))
        : undefined,
    };
    const kind = String(o.kind || "text");
    if (kind === "data") {
      // Anti-fab: số không nguồn → label gắn '(ước tính)' ngay từ graph.
      let data = o.data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const d = { ...(data as Record<string, unknown>) };
        const hasNumber = /\d/.test(JSON.stringify(d));
        const lbl = String(d.label || base.label || "");
        if (hasNumber && !hasSources && !ESTIMATE_RE.test(lbl)) {
          d.label = lbl ? `${lbl} (ước tính)` : "(ước tính)";
        }
        data = d;
      }
      nodes.push({ ...base, kind: "data", data });
    } else if (kind === "entity") {
      const props = o.props && typeof o.props === "object" && !Array.isArray(o.props) ? (o.props as Record<string, unknown>) : {};
      nodes.push({ ...base, kind: "entity", props });
    } else {
      nodes.push({ ...base, kind: "text", text: String(o.text || base.label || "").slice(0, 200) });
    }
  }
  if (nodes.length === 0) return null;

  const kinds = new Set(["sequence", "contrast", "dependency"]);
  let edges: GraphEdge[] = (Array.isArray(r.edges) ? r.edges : [])
    .map((e): GraphEdge | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const from = String(o.from || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      const to = String(o.to || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      const kind = kinds.has(String(o.kind)) ? (String(o.kind) as GraphEdge["kind"]) : "sequence";
      if (!from || !to || from === to || !seen.has(from) || !seen.has(to)) return null;
      return { from, to, kind, reason: o.reason != null ? String(o.reason).slice(0, 80) : undefined };
    })
    .filter((e): e is GraphEdge => e !== null);
  // LLM quên edges → tự nối sequence theo thứ tự node (thứ tự đọc).
  if (edges.length === 0 && nodes.length > 1) {
    edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id, kind: "sequence" as const }));
  }

  const graph: ContentGraph = {
    schemaVersion: 1,
    intent,
    synopsis: r.synopsis != null ? String(r.synopsis).slice(0, 160) : undefined,
    nodes,
    edges,
  };
  const v = validate(graph);
  if (!v.ok) {
    console.error("[scripter] storyboard invalid sau sanitize — bỏ storyboard:", v.errors.map((e) => e.code).join(","));
    return null;
  }
  return graph;
}

export async function generateScript(input: {
  profile: ProfileRecord;
  topic: string;
  painPoint: string;
  targetPersona: string;
  lengthSec?: number;
  dataHook?: string; // góc data từ ContentTopic (Part 3) → định hướng Fact Researcher
  /** PHẦN D: khung kịch bản (listicle/story/mythbust/how-to/news/compare). Rỗng → Writer tự chọn. */
  formatHint?: string;
  /** Phase 4 "dán link → video": Markdown bài nguồn (đã fetch + chặn SSRF) — ghép vào fact brief. */
  sourceBrief?: string;
  /** URL bài nguồn (để ghi vào sources — số liệu truy được về link). */
  sourceUrl?: string;
}): Promise<ScriptResult> {
  const lengthSec = input.lengthSec || 60;
  const wordBudget = wordBudgetFor(lengthSec);
  // B2: model "pro" (Gemini 3.1 Pro mặc định) cho 2 khâu chất lượng — Researcher + Writer. Từ config Hub.
  const writerModel = await hub.llmWriterModel();

  // Tầng 1: Fact Researcher (grounded → số liệu thật + nguồn). Best-effort.
  const fact = await runFactResearcher(input.profile, input.topic, input.dataHook, input.painPoint, writerModel);
  // Bài nguồn người dùng dán (link→video) đứng TRƯỚC trong brief — số trong bài là số "có nguồn".
  if (input.sourceBrief?.trim()) {
    fact.brief = `BÀI NGUỒN NGƯỜI DÙNG CUNG CẤP (số liệu trong đây coi như có nguồn):\n"""\n${input.sourceBrief.trim().slice(0, 6000)}\n"""\n\n${fact.brief}`;
    if (input.sourceUrl) fact.sources = [{ title: `Bài nguồn: ${input.topic}`, url: input.sourceUrl }, ...fact.sources];
  }

  // Tầng 2: Script Writer (JSON, no-grounding) — dùng fact brief + khoá word-budget.
  const llm = await hub.llm();
  const runWriter = () =>
    llm.complete({
      model: writerModel, // B2: Gemini 3.1 Pro — khâu viết quyết định chất lượng
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPrompt(input.profile, input.topic, input.painPoint, input.targetPersona, lengthSec, wordBudget, fact.brief, input.formatHint || "", input.dataHook || ""),
        },
      ],
      maxTokens: 6500, // đủ chỗ cho JSON giàu data-viz (donut/beforeAfter/miniStats/trend...) — KHÔNG làm dài video, chỉ tránh cắt JSON
      responseFormat: "json",
    });

  // Retry 1 lần khi parse hỏng (giống planner/strategist). Model yếu (flash-lite) hay trả prose/JSON-vỡ ở lần đầu.
  let result = await runWriter();
  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
  let parsed = parseScriptJson(result.text);
  let writerCost = result.costUsd;
  if (!parsed) {
    console.error("[scripter] Writer parse JSON hỏng, raw:", result.text?.slice(0, 800));
    result = await runWriter();
    await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
    writerCost += result.costUsd;
    parsed = parseScriptJson(result.text);
    if (!parsed) console.error("[scripter] retry vẫn hỏng:", result.text?.slice(0, 800));
  }

  // Nguồn số liệu = citations THẬT từ Fact Researcher (không nhờ Writer tự đẻ URL → tránh bịa link).
  // Năm: best-effort parse 20xx từ tiêu đề nguồn (C3 — UI script hiện nguồn + năm + link).
  const sources = fact.sources.map((s) => {
    const ym = s.title.match(/\b(20\d{2})\b/);
    return { claim: s.title, url: s.url, year: ym ? ym[1] : undefined };
  });
  const totalCost = fact.costUsd + writerCost;

  // KHÔNG đổ raw text vào body (sẽ ra script rác: vỡ word-budget, rỗng C3, audit pass nhầm).
  // Thà báo lỗi rõ để người dùng tạo lại / đổi model — caller (generateScriptAction) đã bắt & hiện message.
  if (!parsed) {
    throw new Error(
      "Writer không trả JSON hợp lệ sau 2 lần thử (model yếu với JSON phức tạp). Thử lại, hoặc đổi model LLM sang gemini-2.5-flash cho ổn định."
    );
  }

  // Storyboard (Phase 1): sanitize + validate; hỏng → undefined (KHÔNG phá script).
  const storyboard = sanitizeStoryboard(
    (parsed as Record<string, unknown>).storyboard,
    sources.length > 0
  );

  return {
    hook: parsed.hook || "",
    body: parsed.body || "",
    cta: parsed.cta || "",
    caption: parsed.caption || "",
    hashtags: parsed.hashtags || [],
    variantPrompts: parsed.variantPrompts || {
      talking: "",
      broll: { shotList: [], voiceOver: "" },
      animation: { keyMessages: [], dataPoints: [], visualCues: [], voiceOver: "" },
    },
    estimatedDurationSec: parsed.estimatedDurationSec || lengthSec,
    sources: sources.length ? sources : undefined,
    storyboard: storyboard ?? undefined,
    costUsd: totalCost,
  };
}
