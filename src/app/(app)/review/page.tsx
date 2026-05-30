import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { scriptStore } from "@/lib/scripts/storage";
import { videoStore } from "@/lib/video/storage";
import { KanbanBoard, type ReviewItem } from "@/components/review/kanban-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ReviewPage() {
  const scripts = await scriptStore.list();
  const allDrafts = await videoStore.list();

  const items: ReviewItem[] = scripts.map((s) => {
    const drafts = allDrafts
      .filter((d) => d.scriptId === s.id)
      .map((d) => ({
        id: d.id,
        concept: d.concept,
        status: d.status,
        outputUrl: d.outputStoragePath || d.outputUrl,
        durationSec: d.durationSec,
      }));
    return {
      id: s.id,
      topic: s.topic,
      painPoint: s.painPoint,
      targetPersona: s.targetPersona,
      priority: s.priority,
      reviewState: s.reviewState || "draft",
      reviewComment: s.reviewComment,
      audit: s.audit ? { status: s.audit.status, score: s.audit.score } : undefined,
      script: {
        hook: s.script.hook,
        body: s.script.body,
        cta: s.script.cta,
        caption: s.script.caption,
        hashtags: s.script.hashtags,
        estimatedDurationSec: s.script.estimatedDurationSec,
      },
      drafts,
      createdAt: s.createdAt,
    };
  });

  return (
    <>
      <Topbar title="Review" subtitle="Duyệt video draft trước khi export" />
      <div className="p-8">
        {items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Chưa có script nào cần duyệt</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Vào <Link href="/projects" className="text-accent underline">Projects</Link>{" "}
                  sinh content plan → "Script + Audit" → render 3 concept → quay lại đây
                </p>
              </div>
              <Link href="/projects">
                <Button variant="accent" size="sm">Sang Projects</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <KanbanBoard items={items} />
        )}
      </div>
    </>
  );
}
