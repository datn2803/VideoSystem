"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Film,
  Mic,
  Sparkles,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Scissors,
} from "lucide-react";
import {
  renderConceptAction,
  renderAllConceptsAction,
  pollDraftAction,
  deleteDraftAction,
} from "@/lib/video/actions";
import type { ConceptKind } from "@/lib/video/storage";

type Draft = {
  id: string;
  scriptId: string;
  concept: ConceptKind;
  mode?: string;
  providerName: string;
  status: "queued" | "rendering" | "done" | "failed";
  progress: number;
  outputUrl?: string;
  durationSec?: number;
  sizeBytes?: number;
  costUsd: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const CONCEPT_META: Record<ConceptKind, { label: string; icon: typeof Film; color: string; bgColor: string; description: string }> = {
  talking: {
    label: "C1 Talking Head",
    icon: Mic,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "AI avatar HeyGen / footage talking thật",
  },
  broll: {
    label: "C2 B-roll",
    icon: Film,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    description: "Voice-over + ghép footage + caption (Creatomate)",
  },
  animation: {
    label: "C3 Animation",
    icon: Sparkles,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Motion graphics + data viz (Creatomate)",
  },
  "auto-editor": {
    label: "C4 Auto-Editor",
    icon: Scissors,
    color: "text-rose-600",
    bgColor: "bg-rose-100",
    description: "Ghép C1 talking-head + cutaway b-roll C2 (cần render C1 & C2 trước)",
  },
};

export function RenderStudio({
  scriptId,
  initialDrafts,
  hasAvatarProvider,
  hasRenderProvider,
  renderMode = "dryrun",
}: {
  scriptId: string;
  initialDrafts: Draft[];
  hasAvatarProvider: boolean;
  hasRenderProvider: boolean;
  /** Cost-guard (Phase 3): "live" → xác nhận trước khi tốn credit */
  renderMode?: string;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyConcept, setBusyConcept] = useState<ConceptKind | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const draftByConcept = (concept: ConceptKind) => drafts.find((d) => d.concept === concept);
  const hasPending = drafts.some((d) => d.status === "queued" || d.status === "rendering");

  // Polling: every 2s while there's a job in progress
  useEffect(() => {
    if (!hasPending) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const pendingIds = drafts.filter((d) => d.status === "queued" || d.status === "rendering").map((d) => d.id);
      const updates = await Promise.all(pendingIds.map((id) => pollDraftAction(id)));
      setDrafts((prev) => prev.map((d) => updates.find((u) => u?.id === d.id) || d));
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [hasPending, drafts]);

  // Confirm-before-spend (Phase 3): RENDER_MODE=live + concept tốn credit → hỏi trước.
  const confirmSpend = (concepts: ConceptKind[]): boolean => {
    if (renderMode !== "live") return true;
    const paid: string[] = [];
    if (concepts.includes("talking")) paid.push("C1 avatar (~1 credit HeyGen/60s)");
    if (concepts.includes("broll")) paid.push("C2 ảnh AI (~4-5 ảnh gpt-image, cache cũ = $0)");
    if (paid.length === 0) return true;
    return confirm(`RENDER_MODE=live — lần render này có thể TỐN CREDIT:\n• ${paid.join("\n• ")}\n\nTiếp tục?`);
  };

  const handleRender = (concept: ConceptKind, force = false) => {
    if (!confirmSpend([concept])) return;
    setError(null);
    setBusyConcept(concept);
    startTransition(async () => {
      try {
        const result = await renderConceptAction({ scriptId, concept, force });
        // Phân biệt theo `id` (draft thành công có id; draft.error là lỗi-render riêng, KHÔNG dùng để bắt).
        if (!("id" in result)) { setError(result.error || "Render thất bại"); return; }
        setDrafts((prev) => {
          const filtered = prev.filter((d) => d.concept !== concept);
          return [...filtered, result];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyConcept(null);
      }
    });
  };

  const handleRenderAll = () => {
    if (!confirmSpend(["talking", "broll", "animation"])) return;
    setError(null);
    setBusyConcept("all");
    startTransition(async () => {
      try {
        const res = await renderAllConceptsAction(scriptId);
        if ("error" in res) { setError(res.error || "Render thất bại"); return; }
        setDrafts(res.drafts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyConcept(null);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Xóa video draft này?")) return;
    startTransition(async () => {
      await deleteDraftAction(id, scriptId);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    });
  };

  const totalCost = drafts.reduce((s, d) => s + d.costUsd, 0);
  const doneCount = drafts.filter((d) => d.status === "done").length;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-100 text-rose-600">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Video Render Studio</h3>
              <p className="text-xs text-muted-foreground">
                {doneCount}/4 concept đã render · Cost ${totalCost.toFixed(2)}
              </p>
            </div>
          </div>
          <Button variant="accent" size="sm" onClick={handleRenderAll} disabled={isPending}>
            {isPending && busyConcept === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Render cả 3 concept
          </Button>
        </div>

        {(!hasAvatarProvider || !hasRenderProvider) && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">Mock mode</p>
              <p className="text-xs text-amber-800 mt-1">
                {!hasAvatarProvider && <span>HeyGen chưa cấu hình → C1 dùng placeholder. </span>}
                {!hasRenderProvider && <span>Creatomate chưa cấu hình → C2/C3 dùng placeholder. </span>}
                Vào{" "}
                <a href="/settings/integrations" className="underline">
                  Integrations
                </a>{" "}
                để paste key.
              </p>
            </div>
          </div>
        )}

        {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(["talking", "broll", "animation", "auto-editor"] as ConceptKind[]).map((concept) => (
            <ConceptCard
              key={concept}
              concept={concept}
              draft={draftByConcept(concept)}
              busy={isPending && busyConcept === concept}
              onRender={(force) => handleRender(concept, force)}
              onDelete={(id) => handleDelete(id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConceptCard({
  concept,
  draft,
  busy,
  onRender,
  onDelete,
}: {
  concept: ConceptKind;
  draft?: Draft;
  busy: boolean;
  onRender: (force: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const meta = CONCEPT_META[concept];
  const Icon = meta.icon;

  const statusBadge = !draft
    ? null
    : draft.status === "done"
    ? <Badge variant="success" className="text-[9px]"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Done</Badge>
    : draft.status === "failed"
    ? <Badge variant="destructive" className="text-[9px]"><AlertCircle className="h-2.5 w-2.5 mr-1" />Failed</Badge>
    : draft.status === "rendering"
    ? <Badge variant="accent" className="text-[9px]"><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Rendering</Badge>
    : <Badge variant="warning" className="text-[9px]"><Clock className="h-2.5 w-2.5 mr-1" />Queued</Badge>;

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bgColor} ${meta.color} shrink-0`}>
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-xs font-semibold truncate">{meta.label}</span>
        </div>
        {statusBadge}
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2">{meta.description}</p>

      {!draft ? (
        <Button variant="accent" size="sm" className="w-full" onClick={() => onRender(false)} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Render
        </Button>
      ) : draft.status === "done" && draft.outputUrl ? (
        <>
          <div className="relative rounded overflow-hidden bg-zinc-900">
            <video
              src={draft.outputUrl}
              controls
              preload="metadata"
              playsInline
              className="w-full aspect-[9/16] object-contain"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {draft.providerName} · {(draft.sizeBytes || 0) > 0 ? `${((draft.sizeBytes || 0) / 1024 / 1024).toFixed(1)}MB` : ""}
            </span>
            <span>${draft.costUsd.toFixed(2)}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => onRender(true)} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Re-render
            </Button>
            <a href={draft.outputUrl} download className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-7 text-[10px]">
                <Download className="h-3 w-3" />
              </Button>
            </a>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => onDelete(draft.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      ) : draft.status === "failed" ? (
        <>
          <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-[10px] text-rose-700">
            {draft.error || "Render thất bại"}
          </div>
          <Button variant="accent" size="sm" className="w-full" onClick={() => onRender(true)} disabled={busy}>
            <RefreshCw className="h-3 w-3" /> Thử lại
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{draft.status === "queued" ? "Đang xếp hàng..." : `Đang render via ${draft.providerName}`}</span>
              <span>{draft.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${draft.progress}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
