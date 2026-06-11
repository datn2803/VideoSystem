import { hub } from "@/lib/integration-hub/hub";
import { recordLLMUsage } from "@/lib/agents/usage";
import { validate, type ContentGraph } from "@/lib/content-graph";

export type AuditIssue = {
  severity: "critical" | "high" | "medium" | "low";
  rule: string;
  excerpt: string;
  suggestion: string;
};

// Editor: chấm chất lượng biên tập (ngoài compliance) — hook, mật độ data, độ dài.
export type EditorialScore = {
  hookScore: number; // 1-5: hook mạnh cỡ nào
  dataScore: number; // 1-5: mỗi ý có số/bằng chứng không
  wordCount: number; // đếm từ read script (tính bằng code, chính xác)
  wordBudget?: number; // ngân sách từ kỳ vọng (nếu biết)
  lengthOk: boolean; // wordCount ≤ wordBudget
  notes: string; // gợi ý sửa ngắn
};

export type AuditResult = {
  status: "pass" | "fail" | "warning";
  score: number; // 0-100 (compliance)
  issues: AuditIssue[];
  summary: string;
  editorial?: EditorialScore;
  costUsd: number;
};

const BANKING_RULES_VN = [
  {
    id: "no_guaranteed_returns",
    description: "Không hứa lợi nhuận cụ thể hoặc cam kết tỷ suất sinh lời",
    severity: "critical" as const,
  },
  {
    id: "no_absolute_safety",
    description: 'Không dùng cụm từ "an toàn 100%", "không rủi ro", "bảo đảm hoàn toàn"',
    severity: "critical" as const,
  },
  {
    id: "no_competitor_attack",
    description: "Không công kích trực tiếp ngân hàng khác bằng tên cụ thể",
    severity: "high" as const,
  },
  {
    id: "disclaimer_for_investment",
    description: "Phải có disclaimer cho sản phẩm đầu tư (cổ phiếu, trái phiếu, chứng chỉ quỹ)",
    severity: "high" as const,
  },
  {
    id: "no_misleading_insurance",
    description: "Không gây hiểu nhầm bảo hiểm thành tiết kiệm hoặc đầu tư",
    severity: "critical" as const,
  },
  {
    id: "no_credit_misrepresentation",
    description: "Không che giấu lãi suất thực hoặc phí ẩn của thẻ tín dụng/vay",
    severity: "high" as const,
  },
  {
    id: "regulatory_compliance",
    description: "Tuân thủ quy định quảng cáo của NHNN và Luật Quảng cáo",
    severity: "high" as const,
  },
];

const SYSTEM = `Bạn là Editor kiêm Compliance Officer cho content tài chính TikTok/Reels tại Việt Nam.
Bạn vừa kiểm duyệt tuân thủ (NHNN, Luật Quảng cáo, Bảo hiểm), vừa chấm chất lượng biên tập (hook, mật độ data).
Nghiêm khắc nhưng công bằng — chỉ flag khi thực sự có vấn đề, không over-flag.`;

function buildPrompt(scriptText: string, wordBudget?: number): string {
  return `Kiểm duyệt + biên tập script video Personal Banker dưới đây.

A) COMPLIANCE — theo các quy tắc ngành ngân hàng Việt Nam:
${BANKING_RULES_VN.map((r, i) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.description}`).join("\n")}

B) BIÊN TẬP (Editor) — chấm chất lượng:
- hook: 3-5s đầu có đủ mạnh để dừng lướt không? (số sốc / câu hỏi / phản trực giác)
- mật độ data: mỗi ý chính có gắn 1 con số/bằng chứng cụ thể không?
${wordBudget ? `- độ dài: read script nên ≤ ${wordBudget} từ (≈video ngắn).` : ""}

SCRIPT CẦN ĐÁNH GIÁ:
=====
${scriptText}
=====

Phân tích kỹ và trả về JSON (không markdown wrapper):
{
  "status": "pass" | "fail" | "warning",
  "score": 0-100 (100 = compliance hoàn hảo),
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "rule": "tên quy tắc bị vi phạm",
      "excerpt": "đoạn cụ thể trong script gây vấn đề (≤30 từ)",
      "suggestion": "cách sửa cụ thể"
    }
  ],
  "summary": "tóm tắt ngắn 1-2 câu về tổng thể compliance",
  "editorial": {
    "hookScore": 1-5,
    "dataScore": 1-5,
    "notes": "gợi ý biên tập ngắn để hook mạnh hơn / thêm data (≤2 câu)"
  }
}

Quy tắc status (CHỈ về compliance):
- "fail": có ít nhất 1 vi phạm "critical"
- "warning": có ít nhất 1 vi phạm "high" hoặc nhiều vi phạm "medium"
- "pass": không vi phạm gì hoặc chỉ có vi phạm "low"
NẾU SCRIPT KHÔNG VI PHẠM GÌ → issues: [], status: "pass", score: 100 (nhưng vẫn chấm editorial thật).`;
}

// Đếm từ tiếng Việt (đơn giản, ổn định) — tính ở code thay vì nhờ LLM cho chính xác.
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Nhãn anti-fab chấp nhận được trên số liệu không nguồn (khớp scripter.ESTIMATE_RE).
const ESTIMATE_LABEL_RE = /ước tính|ví dụ|minh hoạ|minh họa|tham khảo|~/i;

/**
 * Kiểm storyboard (Phase 1) — chạy BẰNG CODE, $0, không thêm LLM call:
 * 1) graph phải hợp lệ (validate content-graph: id trùng / edge mồ côi / cycle);
 * 2) ANTI-FAB: node data có chữ số mà script KHÔNG có nguồn thật VÀ label thiếu nhãn
 *    'ước tính/ví dụ' → flag (mức medium — builder sẽ tự ẩn/gắn nhãn, không chặn render).
 * Chỉ REPORT — compliance status vẫn do BANKING_RULES_VN quyết.
 */
export function auditStoryboard(graph: ContentGraph, hasSources: boolean): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const v = validate(graph);
  if (!v.ok) {
    issues.push({
      severity: "high",
      rule: "storyboard_invalid",
      excerpt: v.errors.map((e) => e.code).join(", ").slice(0, 80),
      suggestion: "Sinh lại script hoặc bỏ storyboard (đường render cũ không bị ảnh hưởng).",
    });
    return issues;
  }
  for (const n of graph.nodes) {
    if (n.kind !== "data" || n.data == null) continue;
    const blob = JSON.stringify(n.data);
    if (!/\d/.test(blob)) continue;
    const label = String(
      (typeof n.data === "object" && !Array.isArray(n.data) ? (n.data as Record<string, unknown>).label : "") ||
        n.label ||
        ""
    );
    if (!hasSources && !ESTIMATE_LABEL_RE.test(label)) {
      issues.push({
        severity: "medium",
        rule: "storyboard_number_unverified",
        excerpt: `node "${n.id}": ${blob.slice(0, 60)}`,
        suggestion: "Số không truy được về nguồn — gắn nhãn 'ước tính/ví dụ' vào label hoặc ẩn cảnh này.",
      });
    }
  }
  return issues;
}

type ParsedAudit = Omit<AuditResult, "costUsd" | "editorial"> & {
  editorial?: { hookScore?: number; dataScore?: number; notes?: string };
};

function clamp5(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function auditScript(
  scriptText: string,
  opts?: {
    wordBudget?: number;
    /** Storyboard content-graph (nếu script có) → kiểm graph + anti-fab số liệu bằng code, $0. */
    storyboard?: ContentGraph;
    /** Script có nguồn thật (sources từ Fact Researcher grounded) không. */
    hasSources?: boolean;
  }
): Promise<AuditResult> {
  const wordBudget = opts?.wordBudget;
  const wordCount = countWords(scriptText);
  // Kiểm graph TRƯỚC (pure code) — merge vào issues của kết quả LLM ở dưới.
  const graphIssues = opts?.storyboard ? auditStoryboard(opts.storyboard, opts.hasSources === true) : [];
  const llm = await hub.llm();
  const result = await llm.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(scriptText, wordBudget) }],
    maxTokens: 2000,
    responseFormat: "json",
  });

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);

  // Editorial về độ dài tính BẰNG CODE (chính xác); hook/data lấy điểm từ LLM.
  const buildEditorial = (ed?: ParsedAudit["editorial"]): EditorialScore => ({
    hookScore: clamp5(ed?.hookScore),
    dataScore: clamp5(ed?.dataScore),
    wordCount,
    wordBudget,
    lengthOk: wordBudget ? wordCount <= wordBudget : true,
    notes: typeof ed?.notes === "string" ? ed.notes : "",
  });

  try {
    const cleaned = result.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: ParsedAudit;
    try {
      parsed = JSON.parse(cleaned) as ParsedAudit;
    } catch {
      parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned) as ParsedAudit;
    }
    const { editorial: edRaw, ...rest } = parsed;
    return {
      ...rest,
      issues: [...(rest.issues || []), ...graphIssues],
      editorial: buildEditorial(edRaw),
      costUsd: result.costUsd,
    };
  } catch {
    return {
      status: "warning",
      score: 50,
      issues: [
        {
          severity: "medium",
          rule: "audit_parse_error",
          excerpt: "Auditor response not parseable as JSON",
          suggestion: "Có thể là do LLM mock hoặc response sai format. Re-run với LLM provider thật.",
        },
        ...graphIssues,
      ],
      summary: "Không parse được response từ Auditor agent.",
      editorial: buildEditorial(),
      costUsd: result.costUsd,
    };
  }
}
