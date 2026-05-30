import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2, ClipboardCheck } from "lucide-react";
import { scriptStore } from "@/lib/scripts/storage";
import { videoStore } from "@/lib/video/storage";
import { exportStore } from "@/lib/export/storage";
import { ExportCard } from "@/components/export/export-card";
import { localizeCaption } from "@/lib/export/caption-localizer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ExportPage() {
  const scripts = await scriptStore.list();
  const allDrafts = await videoStore.list();
  const allExports = await exportStore.list();

  // Only show approved or exported scripts
  const eligible = scripts.filter(
    (s) => s.reviewState === "approved" || s.reviewState === "exported"
  );

  const items = eligible.map((s) => {
    const drafts = allDrafts
      .filter((d) => d.scriptId === s.id && d.status === "done")
      .map((d) => ({
        id: d.id,
        concept: d.concept,
        outputUrl: d.outputStoragePath || d.outputUrl,
        sizeBytes: d.sizeBytes,
        durationSec: d.durationSec,
      }));
    const captions = {
      tiktok: localizeCaption({
        baseCaption: s.script.caption,
        baseHashtags: s.script.hashtags,
        platform: "tiktok" as const,
        topic: s.topic,
      }),
      facebook: localizeCaption({
        baseCaption: s.script.caption,
        baseHashtags: s.script.hashtags,
        platform: "facebook" as const,
        topic: s.topic,
      }),
      youtube_shorts: localizeCaption({
        baseCaption: s.script.caption,
        baseHashtags: s.script.hashtags,
        platform: "youtube_shorts" as const,
        topic: s.topic,
      }),
    };
    return {
      scriptId: s.id,
      topic: s.topic,
      drafts,
      captions,
      isExported: s.reviewState === "exported",
    };
  });

  const exportedCount = items.filter((i) => i.isExported).length;
  const pendingCount = items.length - exportedCount;

  return (
    <>
      <Topbar title="Export Center" subtitle="Download MP4 + caption sẵn sàng upload đa nền tảng" />
      <div className="p-8 space-y-6">
        {items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Download className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Chưa có script nào được approved</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cần duyệt approve script ở{" "}
                  <Link href="/review" className="text-accent underline">
                    Review
                  </Link>{" "}
                  trước khi có thể export
                </p>
              </div>
              <Link href="/review">
                <Button variant="accent" size="sm">
                  <ClipboardCheck className="h-3 w-3" /> Sang Review
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground font-medium">Sẵn sàng export</p>
                  <p className="mt-2 text-2xl font-bold">{pendingCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Approved nhưng chưa export</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground font-medium">Đã export</p>
                  <p className="mt-2 text-2xl font-bold">{exportedCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tổng tích lũy</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground font-medium">Export records</p>
                  <p className="mt-2 text-2xl font-bold">{allExports.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Per platform per script</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-indigo-50/50 border-indigo-100">
              <CardContent className="p-4 text-sm space-y-1">
                <p className="font-semibold text-indigo-900">📋 Quy trình export</p>
                <ol className="text-xs text-indigo-800 space-y-0.5 ml-4 list-decimal">
                  <li>Download MP4 của từng concept (talking/broll/animation)</li>
                  <li>Chọn platform tab → Copy caption + hashtag đã được tối ưu</li>
                  <li>Upload thủ công lên TikTok / Facebook / YouTube Shorts (D7 chưa có auto-publish API)</li>
                  <li>Click "Đánh dấu đã export" để chuyển script sang trạng thái done</li>
                </ol>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {items.map((item) => (
                <ExportCard key={item.scriptId} {...item} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
