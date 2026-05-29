"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { moveToReviewAction, moveBackToDraftAction, markExportedAction } from "@/lib/review/actions";

export function ReviewStateBar({
  scriptId,
  reviewState,
  reviewComment,
  allRendered,
  doneCount,
}: {
  scriptId: string;
  reviewState?: string;
  reviewComment?: string;
  allRendered: boolean;
  doneCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    startTransition(async () => {
      await moveToReviewAction(scriptId);
      router.refresh();
    });
  };

  const handleBack = () => {
    startTransition(async () => {
      await moveBackToDraftAction(scriptId);
      router.refresh();
    });
  };

  const handleMarkExported = () => {
    startTransition(async () => {
      await markExportedAction(scriptId);
      router.refresh();
    });
  };

  const state = reviewState || "draft";

  const stateUI: Record<string, { label: string; badge: "outline" | "warning" | "success" | "destructive" | "accent"; icon: typeof CheckCircle2; bg: string }> = {
    draft: { label: "Draft", badge: "outline", icon: ClipboardCheck, bg: "bg-zinc-50 border-zinc-200" },
    in_review: { label: "In Review", badge: "warning", icon: ClipboardCheck, bg: "bg-amber-50 border-amber-200" },
    approved: { label: "Approved", badge: "success", icon: CheckCircle2, bg: "bg-emerald-50 border-emerald-200" },
    rejected: { label: "Rejected", badge: "destructive", icon: XCircle, bg: "bg-rose-50 border-rose-200" },
    exported: { label: "Exported", badge: "accent", icon: CheckCircle2, bg: "bg-indigo-50 border-indigo-200" },
  };
  const ui = stateUI[state] || stateUI.draft;
  const Icon = ui.icon;

  return (
    <div className={`rounded-md border p-3 flex items-center gap-3 ${ui.bg}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">Review status:</span>
          <Badge variant={ui.badge}>{ui.label}</Badge>
        </div>
        {reviewComment && (
          <p className="text-xs text-muted-foreground mt-1 italic">"{reviewComment}"</p>
        )}
        {state === "draft" && !allRendered && (
          <p className="text-xs text-muted-foreground mt-1">
            Cần render đủ 3 concept ({doneCount}/3) trước khi gửi duyệt
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {state === "draft" && allRendered && (
          <Button variant="accent" size="sm" onClick={handleSend} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            Gửi duyệt
          </Button>
        )}
        {state === "in_review" && (
          <a href="/review">
            <Button variant="accent" size="sm">
              <ClipboardCheck className="h-3 w-3" /> Sang Review
            </Button>
          </a>
        )}
        {state === "rejected" && (
          <Button variant="outline" size="sm" onClick={handleBack} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3 rotate-180" />}
            Về Draft
          </Button>
        )}
        {state === "approved" && (
          <Button variant="accent" size="sm" onClick={handleMarkExported} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Đánh dấu đã export
          </Button>
        )}
      </div>
    </div>
  );
}
