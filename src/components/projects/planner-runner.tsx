"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calendar, Loader2, Target, Flame, AlertCircle, ShieldCheck } from "lucide-react";
import { generatePlanAction } from "@/lib/profiles/actions";
import { generateScriptAction } from "@/lib/scripts/actions";
import type { ContentTopic } from "@/lib/agents/planner";

type Profile = { id: string; name: string; role: string };

export function PlannerRunner({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [selectedProfile, setSelectedProfile] = useState<string>(profiles[0]?.id || "");
  const [n, setN] = useState(12);
  const [topics, setTopics] = useState<ContentTopic[]>([]);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [scriptingIdx, setScriptingIdx] = useState<number | null>(null);

  const handleGenerateScript = (idx: number, t: ContentTopic) => {
    setScriptingIdx(idx);
    startTransition(async () => {
      try {
        const result = await generateScriptAction({
          profileId: selectedProfile,
          topic: t.topic,
          painPoint: t.pain_point,
          targetPersona: t.target_persona,
          formatHint: t.format_hint,
          priority: t.priority,
        });
        router.push(`/scripts/${result.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setScriptingIdx(null);
      }
    });
  };

  const handleRun = () => {
    if (!selectedProfile) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await generatePlanAction(selectedProfile, n);
        setTopics(r.topics);
        setCost(r.costUsd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  if (profiles.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center space-y-2">
          <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
          <p className="text-sm font-medium">Cần tạo profile trước</p>
          <p className="text-xs text-muted-foreground">Vào /profiles và tạo demo profile để bắt đầu</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Content Planner Agent</h3>
              <p className="text-sm text-muted-foreground">
                AI sinh content calendar từ profile chuyên gia của bạn
              </p>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium">Profile</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.role}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Số chủ đề</label>
              <select
                value={n}
                onChange={(e) => setN(parseInt(e.target.value))}
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={6}>6</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
                <option value={20}>20</option>
              </select>
            </div>
            <Button variant="accent" onClick={handleRun} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isPending ? "AI đang chạy..." : "Sinh content plan"}
            </Button>
          </div>

          {cost !== null && (
            <div className="text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 inline mr-1" /> Plan đã sinh · Cost ${cost.toFixed(4)} ·{" "}
              {topics.length} chủ đề
            </div>
          )}
          {error && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              {error}
              <p className="text-xs mt-1 text-rose-600">
                Tip: nếu chưa có LLM provider, vào /settings/integrations thêm Claude hoặc Gemini (free).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {topics.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {topics.map((t, i) => (
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
                  <p className="text-xs text-muted-foreground italic">"{t.hook}"</p>
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
                  <Button variant="outline" size="sm" className="flex-1">
                    Chỉnh sửa
                  </Button>
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
