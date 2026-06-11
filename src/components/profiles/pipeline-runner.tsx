"use client";
/**
 * Pipeline 1-LỆNH (Phase 5): Plan → Script (graph+design) → Voice → Render 3
 * concept — client tuần tự gọi từng server action (mỗi bước < cap 60s Vercel),
 * hiện tiến độ từng bước, xong điều hướng sang script. Cost-guard nguyên vẹn
 * (mode ≠ live thì C1 mock + C2 gradient như thường).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Zap } from "lucide-react";
import { createProjectWithPlanAction, getProjectAction } from "@/lib/projects/actions";
import { generateScriptAction } from "@/lib/scripts/actions";
import { generateAllAudioAction } from "@/lib/audio/actions";
import { renderAllConceptsAction } from "@/lib/video/actions";

type Step = { label: string; state: "wait" | "run" | "ok" | "err"; note?: string };

export function PipelineRunner({ profileId, renderMode }: { profileId: string; renderMode: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const setStep = (i: number, p: Partial<Step>) =>
    setSteps((prev) => (prev ? prev.map((s, j) => (j === i ? { ...s, ...p } : s)) : prev));

  const run = () => {
    if (renderMode === "live" && !confirm("RENDER_MODE=live — pipeline sẽ tốn credit (TTS + avatar + ảnh AI). Tiếp tục?")) return;
    startTransition(async () => {
      setSteps([
        { label: "Plan (chấm điểm chủ đề)", state: "run" },
        { label: "Script + storyboard + audit", state: "wait" },
        { label: "Voice (TTS)", state: "wait" },
        { label: "Render 3 concept (dispatch)", state: "wait" },
      ]);
      try {
        // 1. Plan (topics đã sắp theo scores.total giảm dần — lấy top 1)
        const created = await createProjectWithPlanAction(profileId, 6);
        const project = await getProjectAction(created.id);
        const top = project?.topics?.[0];
        if (!top) throw new Error("Plan không trả chủ đề nào");
        setStep(0, { state: "ok", note: top.topic.slice(0, 48) });

        // 2. Script
        setStep(1, { state: "run" });
        const sr = await generateScriptAction({
          profileId,
          projectId: created.id,
          topic: top.topic,
          painPoint: top.pain_point || "",
          targetPersona: top.target_persona || "",
          formatHint: top.format_hint,
          dataHook: top.dataHook,
        });
        if ("error" in sr && sr.error) throw new Error(sr.error);
        const scriptId = (sr as { id: string }).id;
        setStep(1, { state: "ok", note: scriptId.slice(0, 8) });

        // 3. Voice
        setStep(2, { state: "run" });
        await generateAllAudioAction(scriptId);
        setStep(2, { state: "ok" });

        // 4. Render cả 3 (dispatch — VPS render async, theo dõi ở trang script)
        setStep(3, { state: "run" });
        await renderAllConceptsAction(scriptId);
        setStep(3, { state: "ok", note: "đang render — xem trang script" });

        router.push(`/scripts/${scriptId}`);
      } catch (e) {
        setSteps((prev) => {
          if (!prev) return prev;
          const i = prev.findIndex((s) => s.state === "run");
          return prev.map((s, j) => (j === i ? { ...s, state: "err", note: e instanceof Error ? e.message : String(e) } : s));
        });
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button variant="accent" size="sm" className="w-full" disabled={isPending} onClick={run}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        Trọn gói 1 lệnh: Plan → Script → Voice → Render
      </Button>
      {steps && (
        <ol className="text-[10px] space-y-0.5">
          {steps.map((s, i) => (
            <li key={i} className={s.state === "err" ? "text-destructive" : s.state === "ok" ? "text-foreground" : "text-muted-foreground"}>
              {s.state === "ok" ? "✅" : s.state === "run" ? "⏳" : s.state === "err" ? "❌" : "·"} {s.label}
              {s.note ? ` — ${s.note}` : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
