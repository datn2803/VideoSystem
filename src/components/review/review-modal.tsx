"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ShieldCheck,
  Mic,
  Film,
  Sparkles,
  Check,
  X,
  Loader2,
  ArrowRight,
} from "lucide-react";
import {
  approveScriptAction,
  rejectScriptAction,
  moveBackToDraftAction,
} from "@/lib/review/actions";

type Concept = "talking" | "broll" | "animation";
type Draft = {
  id: string;
  concept: Concept;
  status: string;
  outputUrl?: string;
  durationSec?: number;
};
type ReviewItem = {
  id: string;
  topic: string;
  painPoint: string;
  targetPersona: string;
  reviewState?: string;
  reviewComment?: string;
  audit?: { status: string; score: number };
  script: {
    hook: string;
    body: string;
    cta: string;
    caption: string;
    hashtags: string[];
    estimatedDurationSec: number;
  };
  drafts: Draft[];
};

const CONCEPT_META: Record<Concept, { label: string; icon: typeof Mic; color: string }> = {
  talking: { label: "C1 Talking", icon: Mic, color: "bg-blue-100 text-blue-600" },
  broll: { label: "C2 B-roll", icon: Film, color: "bg-emerald-100 text-emerald-600" },
  animation: { label: "C3 Animation", icon: Sparkles, color: "bg-purple-100 text-purple-600" },
};

export function ReviewModal({
  item,
  open,
  onOpenChange,
}: {
  item: ReviewItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<"approve" | "reject" | "back" | null>(null);

  if (!item) return null;

  const draftByConcept = (c: Concept) => item.drafts.find((d) => d.concept === c);
  const allRendered = item.drafts.filter((d) => d.status === "done").length;

  const handleApprove = () => {
    setAction("approve");
    startTransition(async () => {
      await approveScriptAction(item.id, comment || undefined);
      onOpenChange(false);
      router.refresh();
    });
  };

  const handleReject = () => {
    if (!comment.trim()) {
      alert("Cần nhập lý do từ chối");
      return;
    }
    setAction("reject");
    startTransition(async () => {
      await rejectScriptAction(item.id, comment);
      onOpenChange(false);
      router.refresh();
    });
  };

  const handleBack = () => {
    setAction("back");
    startTransition(async () => {
      await moveBackToDraftAction(item.id);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{item.topic}</DialogTitle>
              <DialogDescription className="mt-1">
                Pain: {item.painPoint} · Persona: {item.targetPersona}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {item.audit && (
                <Badge
                  variant={
                    item.audit.status === "pass"
                      ? "success"
                      : item.audit.status === "fail"
                      ? "destructive"
                      : "warning"
                  }
                >
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Audit {item.audit.status.toUpperCase()} {item.audit.score}/100
                </Badge>
              )}
              <Badge variant="outline">Render: {allRendered}/3</Badge>
            </div>
          </div>
        </DialogHeader>

        {/* 3 video previews */}
        <div className="grid grid-cols-3 gap-3">
          {(["talking", "broll", "animation"] as Concept[]).map((c) => {
            const d = draftByConcept(c);
            const meta = CONCEPT_META[c];
            const Icon = meta.icon;
            return (
              <div key={c} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.color}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="text-xs font-semibold">{meta.label}</span>
                  {d?.status === "done" && (
                    <Badge variant="success" className="text-[9px] ml-auto">
                      Done
                    </Badge>
                  )}
                  {(!d || d.status !== "done") && (
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {d?.status || "missing"}
                    </Badge>
                  )}
                </div>
                {d?.outputUrl ? (
                  <video
                    src={d.outputUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full aspect-[9/16] object-contain rounded bg-black"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] rounded bg-zinc-100 flex items-center justify-center">
                    <p className="text-[10px] text-muted-foreground text-center px-2">
                      Chưa render
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Script + Caption */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Script</p>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] font-semibold text-amber-600 uppercase">Hook</span>
                <p className="text-xs leading-relaxed">{item.script.hook}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-blue-600 uppercase">Body</span>
                <p className="text-xs leading-relaxed">{item.script.body}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-emerald-600 uppercase">CTA</span>
                <p className="text-xs leading-relaxed">{item.script.cta}</p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border p-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Caption</p>
              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{item.script.caption}</pre>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Hashtags</p>
              <div className="flex flex-wrap gap-1">
                {item.script.hashtags.map((h, i) => (
                  <span key={i} className="text-xs text-indigo-600 font-medium">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Existing review comment */}
        {item.reviewComment && (
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 text-xs">
            <p className="font-medium mb-1">Comment trước đó:</p>
            <p className="text-muted-foreground italic">"{item.reviewComment}"</p>
          </div>
        )}

        {/* Review action */}
        <div className="rounded-md border border-border p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold mb-1">Comment (yêu cầu nếu reject)</p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="VD: Hook chưa đủ mạnh, hãy thay bằng câu hỏi gây tò mò..."
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={isPending}>
              {isPending && action === "back" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3 rotate-180" />}
              Trả về Draft
            </Button>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleReject} disabled={isPending}>
                {isPending && action === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Reject
              </Button>
              <Button variant="accent" size="sm" onClick={handleApprove} disabled={isPending}>
                {isPending && action === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
