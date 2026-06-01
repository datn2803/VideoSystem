"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Flame, ShieldCheck, Loader2, FileText } from "lucide-react";
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
          return (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </div>
                    <Badge variant="outline">{t.format_hint || "educate"}</Badge>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: t.priority || 3 }).map((_, k) => (
                      <Flame key={k} className="h-3 w-3 text-amber-500 fill-amber-500" />
                    ))}
                  </div>
                </div>

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
