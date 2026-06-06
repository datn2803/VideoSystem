"use client";
import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Mic, Film, Sparkles, Copy } from "lucide-react";
import type { ScriptRecord } from "@/lib/scripts/storage";
import { reAuditScriptAction, updateAnimationDataPointsAction } from "@/lib/scripts/actions";

const severityColor: Record<string, "destructive" | "warning" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

export function ScriptDetail({ record }: { record: ScriptRecord }) {
  const [audit, setAudit] = useState(record.audit);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"main" | "talking" | "broll" | "animation">("main");

  const handleReaudit = () => {
    startTransition(async () => {
      const r = await reAuditScriptAction(record.id);
      setAudit(r.audit);
    });
  };

  const auditIcon = audit?.status === "pass" ? ShieldCheck : audit?.status === "fail" ? ShieldX : ShieldAlert;
  const auditColor = audit?.status === "pass" ? "text-emerald-500" : audit?.status === "fail" ? "text-rose-500" : "text-amber-500";
  const AuditIcon = auditIcon;

  return (
    <div className="space-y-4">
      {audit && (
        <Card className={`border-l-4 ${audit.status === "pass" ? "border-l-emerald-500 bg-emerald-50/30" : audit.status === "fail" ? "border-l-rose-500 bg-rose-50/30" : "border-l-amber-500 bg-amber-50/30"}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <AuditIcon className={`h-6 w-6 ${auditColor}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Compliance Audit</h3>
                    <Badge variant={audit.status === "pass" ? "success" : audit.status === "fail" ? "destructive" : "warning"}>
                      {audit.status.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">Score: {audit.score}/100</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{audit.summary}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleReaudit} disabled={isPending}>
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Re-audit
              </Button>
            </div>

            {audit.issues.length > 0 && (
              <div className="space-y-2">
                {audit.issues.map((issue, i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={severityColor[issue.severity] || "outline"} className="text-[10px]">
                        {issue.severity.toUpperCase()}
                      </Badge>
                      <span className="text-xs font-semibold">{issue.rule}</span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">"{issue.excerpt}"</p>
                    <p className="text-xs">
                      <span className="font-medium text-emerald-700">→ Fix:</span> {issue.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {audit.editorial && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
                <span className="font-medium text-muted-foreground">Biên tập:</span>
                <Badge variant="outline" className="text-[10px]">Hook {audit.editorial.hookScore}/5</Badge>
                <Badge variant="outline" className="text-[10px]">Data {audit.editorial.dataScore}/5</Badge>
                <Badge variant={audit.editorial.lengthOk ? "success" : "warning"} className="text-[10px]">
                  {audit.editorial.wordCount}
                  {audit.editorial.wordBudget ? `/${audit.editorial.wordBudget}` : ""} từ
                </Badge>
                {audit.editorial.notes && (
                  <span className="text-muted-foreground italic">— {audit.editorial.notes}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 border-b border-border">
        {[
          { id: "main", label: "Script chính", icon: Sparkles },
          { id: "talking", label: "C1 Talking Head", icon: Mic },
          { id: "broll", label: "C2 B-roll", icon: Film },
          { id: "animation", label: "C3 Animation", icon: Sparkles },
        ].map((t) => {
          const TIcon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TIcon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "main" && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardContent className="p-5 space-y-4">
              <Section label="HOOK (3-5s)" content={record.script.hook} />
              <Section label="BODY" content={record.script.body} />
              <Section label="CTA (5-10s)" content={record.script.cta} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-4">
              <Section label="Caption" content={record.script.caption} copyable />
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                  Hashtags
                </p>
                <div className="flex flex-wrap gap-1">
                  {record.script.hashtags.map((h, i) => (
                    <span key={i} className="text-xs text-indigo-600 font-medium">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              {record.script.sources && record.script.sources.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                    Nguồn số liệu (real-time)
                  </p>
                  <ul className="space-y-1">
                    {record.script.sources.map((s, i) => (
                      <li key={i} className="text-xs">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline line-clamp-1"
                        >
                          {i + 1}. {s.claim}
                          {s.year ? ` (${s.year})` : ""}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                <div>⏱️ Độ dài ước tính: {record.script.estimatedDurationSec}s</div>
                <div>💰 Cost generation: ${record.script.costUsd.toFixed(4)}</div>
                <div>📝 Version: {record.version}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "talking" && (
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
              Prompt cho HeyGen / footage talking head
            </p>
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/40 rounded-md p-4 max-h-[60vh] overflow-y-auto">
              {record.script.variantPrompts.talking}
            </pre>
          </CardContent>
        </Card>
      )}

      {activeTab === "broll" && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                Shot list
              </p>
              <div className="space-y-1">
                {record.script.variantPrompts.broll.shotList.map((shot, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md border border-border p-2">
                    <Badge variant="outline" className="text-[10px]">
                      #{i + 1}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {shot.footageTag}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{shot.durationSec}s</span>
                    <span className="text-xs flex-1">{shot.note}</span>
                  </div>
                ))}
              </div>
            </div>
            <Section label="Voice-over" content={record.script.variantPrompts.broll.voiceOver} />
          </CardContent>
        </Card>
      )}

      {activeTab === "animation" && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                  Key messages
                </p>
                <ul className="space-y-1 text-xs">
                  {record.script.variantPrompts.animation.keyMessages.map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent">•</span> {m}
                    </li>
                  ))}
                </ul>
              </div>
              <DataPointsEditor
                scriptId={record.id}
                initial={record.script.variantPrompts.animation.dataPoints}
              />
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                  Visual cues
                </p>
                <ul className="space-y-1 text-xs">
                  {record.script.variantPrompts.animation.visualCues.map((v, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-purple-500">🎨</span> {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Section label="Voice-over" content={record.script.variantPrompts.animation.voiceOver} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Duyệt/sửa SỐ LIỆU C3 (human gatekeeper). Số trong C3 do AI viết kịch bản sinh ra
 * → CHƯA kiểm chứng. Tommy sửa/giữ số chính xác ở đây + Lưu TRƯỚC khi render C3.
 * Chỉ dòng có SỐ mới thành biểu đồ; xoá hết → C3 ẩn scene số (không hiện số sai).
 */
function DataPointsEditor({ scriptId, initial }: { scriptId: string; initial: string[] }) {
  const [items, setItems] = useState<string[]>(initial && initial.length ? initial : [""]);
  const [saved, setSaved] = useState(false);
  const [pending, startSave] = useTransition();

  const setAt = (i: number, val: string) => {
    setSaved(false);
    setItems((prev) => prev.map((x, j) => (j === i ? val : x)));
  };
  const removeAt = (i: number) => {
    setSaved(false);
    setItems((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [""]));
  };
  const add = () => {
    setSaved(false);
    setItems((prev) => [...prev, ""]);
  };
  const save = () => {
    const clean = items.map((s) => s.trim()).filter(Boolean);
    startSave(async () => {
      await updateAnimationDataPointsAction(scriptId, clean);
      setItems(clean.length ? clean : [""]);
      setSaved(true);
    });
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">
        Data points — DUYỆT trước khi render C3
      </p>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-800 mb-2 leading-relaxed">
        ⚠️ Số do AI sinh, <b>chưa kiểm chứng</b>. Số liệu này sẽ <b>hiện trong video C3</b> — hãy sửa cho{" "}
        <b>CHÍNH XÁC</b> rồi bấm Lưu. Chỉ dòng có <b>số</b> mới thành biểu đồ; xoá hết → C3 ẩn phần số.
        Định dạng nên là <i>“Nhãn: số đơn-vị”</i> (vd “Lãi cố định: 8 % / năm”).
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input
              value={it}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder="vd: Lãi thả nổi: 10 % / năm"
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs"
            />
            <button
              onClick={() => removeAt(i)}
              className="text-muted-foreground hover:text-rose-500 text-xs px-1"
              title="Xoá dòng"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={add} className="text-[10px] text-muted-foreground hover:text-foreground">
          + Thêm dòng
        </button>
        <Button variant="accent" size="sm" className="h-7 text-[10px]" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Lưu số liệu đã duyệt
        </Button>
        {saved && <span className="text-[10px] text-emerald-600">Đã lưu ✓ — giờ render C3</span>}
      </div>
    </div>
  );
}

function Section({ label, content, copyable }: { label: string; content: string; copyable?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">{label}</p>
        {copyable && (
          <button
            onClick={() => navigator.clipboard.writeText(content)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        )}
      </div>
      <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-md bg-muted/30 p-3">{content}</div>
    </div>
  );
}
