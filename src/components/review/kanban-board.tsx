"use client";
import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, ShieldX, Flame, Play, ArrowRight, Loader2, FileText, ExternalLink } from "lucide-react";
import { moveToReviewAction, markExportedAction } from "@/lib/review/actions";
import { ReviewModal } from "./review-modal";

type Concept = "talking" | "broll" | "animation";
type Draft = {
  id: string;
  concept: Concept;
  status: string;
  outputUrl?: string;
  durationSec?: number;
};

export type ReviewItem = {
  id: string;
  topic: string;
  painPoint: string;
  targetPersona: string;
  priority?: number;
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
  createdAt: string;
};

const COLUMNS = [
  { id: "draft", title: "Draft", dotColor: "bg-zinc-400", description: "Mới render, chờ gửi duyệt" },
  { id: "in_review", title: "In Review", dotColor: "bg-amber-500", description: "Đang chờ duyệt" },
  { id: "approved", title: "Approved", dotColor: "bg-emerald-500", description: "Sẵn sàng export" },
  { id: "rejected", title: "Rejected", dotColor: "bg-rose-500", description: "Bị reject, cần sửa" },
] as const;

export function KanbanBoard({ items }: { items: ReviewItem[] }) {
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [exportedFilter, setExportedFilter] = useState<"hide" | "show">("hide");

  const visibleItems = items.filter((it) => {
    if (exportedFilter === "hide" && it.reviewState === "exported") return false;
    return true;
  });

  const grouped: Record<string, ReviewItem[]> = {
    draft: [],
    in_review: [],
    approved: [],
    rejected: [],
  };
  for (const it of visibleItems) {
    const state = it.reviewState || "draft";
    if (state === "exported") continue;
    (grouped[state] = grouped[state] || []).push(it);
  }

  const exportedCount = items.filter((it) => it.reviewState === "exported").length;

  const handleCardClick = (it: ReviewItem) => {
    setSelectedItem(it);
    setModalOpen(true);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {visibleItems.length} script đang trong workflow
        </div>
        {exportedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportedFilter(exportedFilter === "hide" ? "show" : "hide")}
          >
            {exportedFilter === "hide" ? "Hiện" : "Ẩn"} {exportedCount} đã export
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 h-[calc(100vh-14rem)]">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col rounded-lg bg-muted/30 p-3">
            <div className="flex items-center justify-between px-2 mb-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <span className="text-xs text-muted-foreground">{grouped[col.id].length}</span>
              </div>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {grouped[col.id].length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Trống
                </div>
              ) : (
                grouped[col.id].map((item) => (
                  <ReviewCard
                    key={item.id}
                    item={item}
                    onClick={() => handleCardClick(item)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <ReviewModal item={selectedItem} open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}

function ReviewCard({ item, onClick }: { item: ReviewItem; onClick: () => void }) {
  const [isPending, startTransition] = useTransition();
  const state = item.reviewState || "draft";
  const allDone = item.drafts.length > 0 && item.drafts.every((d) => d.status === "done");
  const someDone = item.drafts.filter((d) => d.status === "done").length;
  const firstDraft = item.drafts.find((d) => d.status === "done" && d.outputUrl);

  const handleSendToReview = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await moveToReviewAction(item.id);
    });
  };

  const handleMarkExported = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await markExportedAction(item.id);
    });
  };

  const auditIcon =
    item.audit?.status === "pass" ? ShieldCheck : item.audit?.status === "fail" ? ShieldX : ShieldAlert;
  const auditColor =
    item.audit?.status === "pass"
      ? "text-emerald-500"
      : item.audit?.status === "fail"
      ? "text-rose-500"
      : "text-amber-500";
  const AuditIcon = auditIcon;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      {firstDraft?.outputUrl ? (
        <div className="relative aspect-video bg-zinc-900 rounded-t-lg overflow-hidden group">
          <video
            src={firstDraft.outputUrl}
            preload="metadata"
            playsInline
            className="w-full h-full object-cover"
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
            <Play className="h-6 w-6 text-white/70 group-hover:text-white opacity-0 group-hover:opacity-100" />
          </div>
          <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
            {someDone}/3 concept
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-zinc-100 rounded-t-lg flex items-center justify-center">
          <div className="text-center">
            <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground">{someDone}/3 rendered</p>
          </div>
        </div>
      )}
      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-semibold line-clamp-2 leading-snug">{item.topic}</p>
        <div className="flex items-center justify-between flex-wrap gap-1">
          {item.audit && (
            <Badge
              variant={
                item.audit.status === "pass"
                  ? "success"
                  : item.audit.status === "fail"
                  ? "destructive"
                  : "warning"
              }
              className="text-[9px]"
            >
              <AuditIcon className={`h-2.5 w-2.5 mr-0.5 ${auditColor}`} />
              {item.audit.score}/100
            </Badge>
          )}
          {item.priority && (
            <div className="flex gap-0.5">
              {Array.from({ length: item.priority }).map((_, k) => (
                <Flame key={k} className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
              ))}
            </div>
          )}
        </div>
        {item.reviewComment && state !== "approved" && (
          <p className="text-[10px] text-muted-foreground italic line-clamp-2">"{item.reviewComment}"</p>
        )}

        {state === "draft" && allDone && (
          <Button
            variant="accent"
            size="sm"
            className="w-full h-7 text-[10px]"
            onClick={handleSendToReview}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            Gửi duyệt
          </Button>
        )}
        {state === "draft" && !allDone && (
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" disabled>
            Chờ đủ 3 concept
          </Button>
        )}
        {state === "in_review" && (
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={onClick}>
            Mở duyệt
          </Button>
        )}
        {state === "approved" && (
          <div className="flex gap-1">
            <a
              href={`/scripts/${item.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex-1"
            >
              <Button variant="outline" size="sm" className="w-full h-7 text-[10px]">
                <ExternalLink className="h-3 w-3" /> Detail
              </Button>
            </a>
            <Button variant="accent" size="sm" className="flex-1 h-7 text-[10px]" onClick={handleMarkExported}>
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Đã export"}
            </Button>
          </div>
        )}
        {state === "rejected" && (
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={onClick}>
            Xem & sửa
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
