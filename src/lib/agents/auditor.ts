import { hub } from "@/lib/integration-hub/hub";
import { store } from "@/lib/integration-hub/storage";

export type AuditIssue = {
  severity: "critical" | "high" | "medium" | "low";
  rule: string;
  excerpt: string;
  suggestion: string;
};

export type AuditResult = {
  status: "pass" | "fail" | "warning";
  score: number; // 0-100
  issues: AuditIssue[];
  summary: string;
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

const SYSTEM = `Bạn là Compliance Officer chuyên kiểm duyệt content quảng cáo tài chính tại Việt Nam.
Bạn am hiểu quy định NHNN, Luật Quảng cáo, Luật Bảo hiểm, các quy định về quảng cáo sản phẩm tài chính.
Bạn nghiêm khắc nhưng công bằng — chỉ flag khi thực sự có vấn đề, không over-flag.`;

function buildPrompt(scriptText: string): string {
  return `Kiểm duyệt script video Personal Banker dưới đây theo các quy tắc compliance ngành ngân hàng Việt Nam:

${BANKING_RULES_VN.map((r, i) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.description}`).join("\n")}

SCRIPT CẦN KIỂM DUYỆT:
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
  "summary": "tóm tắt ngắn 1-2 câu về tổng thể compliance"
}

Quy tắc đánh giá:
- "fail": có ít nhất 1 vi phạm "critical"
- "warning": có ít nhất 1 vi phạm "high" hoặc nhiều vi phạm "medium"
- "pass": không vi phạm gì hoặc chỉ có vi phạm "low"

NẾU SCRIPT KHÔNG VI PHẠM GÌ → trả về issues: [], status: "pass", score: 100.`;
}

async function recordLLMUsage(costUsd: number, tokensIn: number, tokensOut: number) {
  const providers = (await store.listProviders()).filter((p) => p.kind === "llm" && p.enabled);
  const def = providers.find((p) => p.isDefault) || providers[0];
  if (!def) return;
  await store.recordUsage({
    providerId: def.id,
    date: new Date().toISOString().slice(0, 10),
    unitsUsed: tokensIn + tokensOut,
    costEstimateUsd: costUsd,
    requestCount: 1,
  });
}

export async function auditScript(scriptText: string): Promise<AuditResult> {
  const llm = await hub.llm();
  const result = await llm.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(scriptText) }],
    maxTokens: 2000,
    responseFormat: "json",
  });

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);

  try {
    const cleaned = result.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: Omit<AuditResult, "costUsd">;
    try {
      parsed = JSON.parse(cleaned) as Omit<AuditResult, "costUsd">;
    } catch {
      parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned) as Omit<AuditResult, "costUsd">;
    }
    return { ...parsed, costUsd: result.costUsd };
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
      costUsd: result.costUsd,
    };
  }
}
