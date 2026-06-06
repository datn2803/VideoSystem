import { hub } from "@/lib/integration-hub/hub";
import { recordLLMUsage } from "@/lib/agents/usage";

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

type ParsedAudit = Omit<AuditResult, "costUsd" | "editorial"> & {
  editorial?: { hookScore?: number; dataScore?: number; notes?: string };
};

function clamp5(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function auditScript(scriptText: string, opts?: { wordBudget?: number }): Promise<AuditResult> {
  const wordBudget = opts?.wordBudget;
  const wordCount = countWords(scriptText);
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
    return { ...rest, editorial: buildEditorial(edRaw), costUsd: result.costUsd };
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
      ],
      summary: "Không parse được response từ Auditor agent.",
      editorial: buildEditorial(),
      costUsd: result.costUsd,
    };
  }
}
