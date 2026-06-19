import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";
import { scriptStore } from "@/lib/scripts/storage";
import { store } from "@/lib/integration-hub/storage";
import { audioStore } from "@/lib/audio/storage";
import { videoStore } from "@/lib/video/storage";
import { ScriptDetail } from "@/components/scripts/script-detail";
import { SceneStudio } from "@/components/scripts/scene-studio";
import { VoiceStudio } from "@/components/audio/voice-studio";
import { MusicStudio } from "@/components/audio/music-studio";
import { RenderStudio } from "@/components/video/render-studio";
import { ReviewStateBar } from "@/components/review/send-to-review-button";
import { renderMode } from "@/lib/video/cost-guard";
import { getOrCreateBrandKit } from "@/lib/design/director";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Server actions (sinh ảnh C2 + TTS + dispatch render) chạy trong route này → cần đủ giờ.
// C2 ACCURATE (BLUEPRINT_C2_V2): ảnh quality medium/high chậm hơn → nâng maxDuration lên 300s
// (mặc định mới của Vercel trên mọi plan; Fluid/Pro hỗ trợ). Sinh ảnh vẫn SONG SONG (Promise.all).
// Plan thấp hơn sẽ tự clamp xuống mức cho phép — không phá C2 cũ (vốn xong <60s).
export const maxDuration = 300;
export default async function ScriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await scriptStore.get(id);
  if (!record) notFound();
  const profile = await store.getProfile(record.profileId);
  const audios = await audioStore.byScript(id);
  const allProviders = await store.listProviders();
  const drafts = (await videoStore.byScript(id)).map((d) => ({
    id: d.id,
    scriptId: d.scriptId,
    concept: d.concept,
    mode: d.mode,
    providerName: d.providerName,
    status: d.status,
    progress: d.progress,
    outputUrl: d.outputStoragePath || d.outputUrl,
    durationSec: d.durationSec,
    sizeBytes: d.sizeBytes,
    costUsd: d.costUsd,
    error: d.error,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
  const ttsProviders = allProviders.filter((p) => p.kind === "tts" && p.enabled);
  const hasTTSProvider = ttsProviders.length > 0;
  // Default tốc độ đọc lấy từ provider TTS default (ElevenLabs config.speed); fallback để component tự xử lý.
  const defaultTTS = ttsProviders.find((p) => p.isDefault) || ttsProviders[0];
  const cfgSpeed = Number(defaultTTS?.config?.speed);
  const defaultSpeed = Number.isFinite(cfgSpeed) ? cfgSpeed : undefined;
  const hasAvatarProvider = allProviders.some((p) => p.kind === "avatar" && p.enabled);
  const hasRenderProvider = allProviders.some((p) => p.kind === "render" && p.enabled);
  // Gate gửi-duyệt tính trên 3 BASE concept (talking/broll/animation) — KHÔNG tính C4 auto-editor
  // (composition phụ, render sau) → GIỮ NGUYÊN ngưỡng "đủ 3 concept" như trước khi thêm C4.
  const doneCount = drafts.filter((d) => d.status === "done" && d.concept !== "auto-editor").length;

  return (
    <>
      <Topbar title={record.topic} subtitle={`Profile: ${profile?.name || "Unknown"} · v${record.version}`} />
      <div className="p-8 space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/scripts">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3 w-3" /> Quay lại Scripts
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Pain: {record.painPoint}</span>
            <span>·</span>
            <span>Persona: {record.targetPersona}</span>
            {record.formatHint && (
              <>
                <span>·</span>
                <Badge variant="outline" className="text-[10px]">
                  {record.formatHint}
                </Badge>
              </>
            )}
          </div>
        </div>

        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <div className="flex-1 text-sm">
              Pipeline:{" "}
              <strong>Scripter ✓</strong> →{" "}
              <strong>Auditor ✓</strong> →{" "}
              <strong>Voice {audios.length > 0 ? "✓" : "←"}</strong> →{" "}
              <strong>Render {doneCount}/3</strong> → Review (D6)
            </div>
          </CardContent>
        </Card>

        <ReviewStateBar
          scriptId={id}
          reviewState={record.reviewState}
          reviewComment={record.reviewComment}
          allRendered={doneCount === 3}
          doneCount={doneCount}
        />

        <VoiceStudio scriptId={id} initialAudios={audios} hasTTSProvider={hasTTSProvider} defaultSpeed={defaultSpeed} />

        <MusicStudio
          scriptId={id}
          initialMusicUrl={audios.find((a) => a.part === "music")?.storagePath ?? null}
          renderMode={renderMode()}
        />

        <RenderStudio
          scriptId={id}
          initialDrafts={drafts}
          hasAvatarProvider={hasAvatarProvider}
          hasRenderProvider={hasRenderProvider}
          renderMode={renderMode()}
        />

        <SceneStudio
          scriptId={id}
          storyboard={record.script.storyboard ?? null}
          tokens={(await getOrCreateBrandKit(record.profileId))?.tokens ?? null}
        />

        <ScriptDetail record={record} />
      </div>
    </>
  );
}
