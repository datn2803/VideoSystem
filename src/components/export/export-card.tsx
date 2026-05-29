"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, Check, Loader2, Mic, Film, Sparkles, ExternalLink, CheckCircle2 } from "lucide-react";
import { recordExportAction, markAllExportedAction } from "@/lib/export/actions";
import { PLATFORM_META } from "@/lib/export/caption-localizer";
import type { Platform } from "@/lib/export/storage";

type Concept = "talking" | "broll" | "animation";
type Draft = {
  id: string;
  concept: Concept;
  outputUrl?: string;
  sizeBytes?: number;
  durationSec?: number;
};

type CaptionByPlatform = {
  tiktok: { caption: string; hashtags: string[] };
  facebook: { caption: string; hashtags: string[] };
  youtube_shorts: { caption: string; hashtags: string[] };
};

const CONCEPT_META: Record<Concept, { label: string; icon: typeof Mic; color: string }> = {
  talking: { label: "C1 Talking", icon: Mic, color: "bg-blue-100 text-blue-600" },
  broll: { label: "C2 B-roll", icon: Film, color: "bg-emerald-100 text-emerald-600" },
  animation: { label: "C3 Animation", icon: Sparkles, color: "bg-purple-100 text-purple-600" },
};

export function ExportCard({
  scriptId,
  topic,
  drafts,
  captions,
  isExported,
}: {
  scriptId: string;
  topic: string;
  drafts: Draft[];
  captions: CaptionByPlatform;
  isExported: boolean;
}) {
  const [activePlatform, setActivePlatform] = useState<Platform>("tiktok");
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadOne = (platform: Platform, concept: Concept) => {
    startTransition(async () => {
      await recordExportAction({ scriptId, platform });
    });
  };

  const handleMarkAllExported = () => {
    if (!confirm(`Đánh dấu "${topic}" đã export đầy đủ?`)) return;
    startTransition(async () => {
      await markAllExportedAction(scriptId);
    });
  };

  const current = captions[activePlatform];
  const hashtagText = current.hashtags.join(" ");
  const fullClipboardText = `${current.caption}\n\n${hashtagText}`;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">{topic}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {drafts.length}/3 concept · Sẵn sàng upload lên TikTok / Facebook / YouTube Shorts
            </p>
          </div>
          {isExported ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Đã export
            </Badge>
          ) : (
            <Button variant="accent" size="sm" onClick={handleMarkAllExported} disabled={isPending}>
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Đánh dấu đã export
            </Button>
          )}
        </div>

        {/* 3 video downloads */}
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
            Video MP4 (9:16, sẵn sàng upload)
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(["talking", "broll", "animation"] as Concept[]).map((concept) => {
              const d = drafts.find((x) => x.concept === concept);
              const meta = CONCEPT_META[concept];
              const Icon = meta.icon;
              return (
                <div key={concept} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.color}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="text-xs font-semibold">{meta.label}</span>
                  </div>
                  {d?.outputUrl ? (
                    <>
                      <div className="aspect-[9/16] rounded bg-zinc-900 overflow-hidden">
                        <video
                          src={d.outputUrl}
                          preload="metadata"
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{d.durationSec}s</span>
                        <span>{((d.sizeBytes || 0) / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                      <a href={d.outputUrl} download={`${topic.slice(0, 30)}-${concept}.mp4`} className="block">
                        <Button variant="default" size="sm" className="w-full h-8">
                          <Download className="h-3 w-3" /> Download
                        </Button>
                      </a>
                    </>
                  ) : (
                    <div className="aspect-[9/16] rounded bg-zinc-100 flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground">Chưa render</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Caption tabs */}
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
            Caption + Hashtag (đã tối ưu theo platform)
          </p>
          <div className="flex gap-2 border-b border-border mb-3">
            {(["tiktok", "facebook", "youtube_shorts"] as Platform[]).map((p) => {
              const meta = PLATFORM_META[p];
              return (
                <button
                  key={p}
                  onClick={() => setActivePlatform(p)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activePlatform === p
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-3 relative">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Caption</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => handleCopy(current.caption, `${activePlatform}-caption`)}
                >
                  {copied === `${activePlatform}-caption` ? (
                    <>
                      <Check className="h-3 w-3" /> Đã copy
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{current.caption}</pre>
            </div>

            <div className="rounded-md bg-muted/40 p-3 relative">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Hashtags ({current.hashtags.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => handleCopy(hashtagText, `${activePlatform}-tags`)}
                >
                  {copied === `${activePlatform}-tags` ? (
                    <>
                      <Check className="h-3 w-3" /> Đã copy
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {current.hashtags.map((h, i) => (
                  <span key={i} className="text-xs text-indigo-600 font-medium">
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <Button
              variant="accent"
              size="sm"
              className="w-full"
              onClick={() => handleCopy(fullClipboardText, `${activePlatform}-full`)}
            >
              {copied === `${activePlatform}-full` ? (
                <>
                  <Check className="h-3 w-3" /> Đã copy đầy đủ
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy caption + hashtags (full)
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
