"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Flame, ShieldCheck, Loader2, FileText, Layers, Sprout, BarChart3, Link2, Zap } from "lucide-react";
import { generateScriptAction } from "@/lib/scripts/actions";
import type { ContentTopic } from "@/lib/agents/planner";

// topic.topic -> { id, score?, reviewState? } cho các topic ĐÃ sinh script
export type DoneScript = { id: string; score?: number; reviewState?: string };

export function ProjectTopics({
  projectId,
  profileId,
  topics,
  doneByTopic,
}: {
  projectId: string;
  profileId: string;
  topics: ContentTopic[];
  doneByTopic: Record<string, DoneScript>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [scriptingIdx, setScriptingIdx] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGenerateScript = (idx: number, t: ContentTopic) => {
    setScriptingIdx(idx);
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateScriptAction({
          profileId,
          projectId,
          topic: t.topic,
          painPoint: t.pain_point,
          targetPersona: t.target_persona,
          formatHint: t.format_hint,
          priority: t.priority,
          dataHook: t.dataHook,
        });
        if (result.error || !result.id) {
          setError(result.error || "Tạo script không thành công, thử lại sau.");
          setScriptingIdx(null);
          return;
        }
        router.push(`/scripts/${result.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setScriptingIdx(null);
      }
    });
  };

  if (topics.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Plan rỗng — bấm "Sinh lại plan" ở trên để AI đề xuất chủ đề.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        {topics.map((t, i) => {
          const done = doneByTopic[t.topic];
          const sc = t.scores;
          const flames = t.priority || (sc ? Math.min(5, Math.max(1, Math.round(sc.total / 3))) : 3);
          return (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                      {i + 1}
                    </div>
                    <Badge variant="outline">{t.format_hint || "educate"}</Badge>
                    {t.contentType === "trend" ? (
                      <Badge className="border-transparent bg-amber-100 text-amber-700">
                        <Flame className="h-3 w-3" /> Trend
                      </Badge>
                    ) : t.contentType === "evergreen" ? (
                      <Badge className="border-transparent bg-emerald-100 text-emerald-700">
                        <Sprout className="h-3 w-3" /> Evergreen
                      </Badge>
                    ) : null}
                  </div>
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    title={sc ? `Demand ${sc.demand} · Virality ${sc.virality} · Relevance ${sc.relevance} = ${sc.total}/15` : undefined}
                  >
                    {Array.from({ length: flames }).map((_, k) => (
                      <Flame key={k} className="h-3 w-3 text-amber-500 fill-amber-500" />
                    ))}
                    {sc && <span className="ml-1 text-[11px] font-medium text-muted-foreground tabular-nums">{sc.total}</span>}
                  </div>
                </div>

                {t.pillar && (
                  <div className="flex items-center gap-1.5 text-[11px] text-accent">
                    <Layers className="h-3 w-3 shrink-0" />
                    <span className="font-medium">{t.pillar}</span>
                  </div>
                )}

                <h4 className="font-semibold leading-snug">{t.topic}</h4>

                <div className="rounded-md bg-muted/50 px-3 py-2 border-l-2 border-accent">
                  <p className="text-xs text-muted-foreground italic">&quot;{t.hook}&quot;</p>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-start gap-2">
                    <Target className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-muted-foreground shrink-0">Pain:</span>
                    <span>{t.pain_point}</span>
                  </div>
                  <div className="text-muted-foreground">
                    👤 <span className="text-foreground">{t.target_persona}</span>
                  </div>
                  {t.whyNow && (
                    <div className="flex items-start gap-2">
                      <Zap className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground shrink-0">Vì sao giờ:</span>
                      <span>{t.whyNow}</span>
                    </div>
                  )}
                  {t.dataHook && (
                    <div className="flex items-start gap-2">
                      <BarChart3 className="h-3 w-3 text-indigo-500 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground shrink-0">Data:</span>
                      <span>{t.dataHook}</span>
                    </div>
                  )}
                  {t.sources && t.sources.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Link2 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {t.sources.slice(0, 3).map((s, k) => (
                          <a
                            key={k}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent underline-offset-2 hover:underline line-clamp-1"
                          >
                            {s.title}
                          </a>
                        ))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-border">
                  {done ? (
                    <>
                      {typeof done.score === "number" && (
                        <Badge variant={done.score >= 80 ? "success" : "outline"} className="self-center">
                          Audit {done.score}
                        </Badge>
                      )}
                      <Link href={`/scripts/${done.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <FileText className="h-3 w-3" /> Xem script
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <Button
                      variant="accent"
                      size="sm"
                      className="flex-1"
                      disabled={isPending && scriptingIdx === i}
                      onClick={() => handleGenerateScript(i, t)}
                    >
                      {isPending && scriptingIdx === i ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                      Script + Audit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
