"use client";
import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  Loader2,
  RefreshCw,
  Trash2,
  Download,
  Volume2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  generateAudioAction,
  generateAllAudioAction,
  deleteAudioAction,
  listVoicesAction,
} from "@/lib/audio/actions";
import type { AudioRecord, AudioPart } from "@/lib/audio/storage";

type Voice = { id: string; name: string; lang: string; gender?: string; providerName: string };

const PART_LABEL: Record<AudioPart, string> = {
  hook: "HOOK",
  body: "BODY",
  cta: "CTA",
  full: "Full script (cho C1 Talking)",
  broll: "B-roll voice-over (cho C2)",
  animation: "Animation voice-over (cho C3)",
};

const PART_COLOR: Record<AudioPart, "default" | "accent" | "success" | "warning"> = {
  hook: "warning",
  body: "default",
  cta: "warning",
  full: "accent",
  broll: "success",
  animation: "accent",
};

export function VoiceStudio({
  scriptId,
  initialAudios,
  hasTTSProvider,
  defaultSpeed,
}: {
  scriptId: string;
  initialAudios: AudioRecord[];
  hasTTSProvider: boolean;
  defaultSpeed?: number;
}) {
  const [audios, setAudios] = useState(initialAudios);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [speed, setSpeed] = useState<number>(defaultSpeed ?? 1.5);
  const [busyPart, setBusyPart] = useState<AudioPart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const v = await listVoicesAction();
      setVoices(v);
      if (v.length > 0 && !selectedVoiceId) setSelectedVoiceId(v[0].id);
    })();
  }, []);

  const audioByPart = (part: AudioPart) => audios.find((a) => a.part === part);

  const generate = (part: AudioPart) => {
    setError(null);
    setBusyPart(part);
    startTransition(async () => {
      try {
        const voice = voices.find((v) => v.id === selectedVoiceId);
        const result = await generateAudioAction({
          scriptId,
          part,
          voiceId: selectedVoiceId,
          voiceName: voice?.name,
          speed,
        });
        // Optimistically update
        setAudios((prev) => {
          const filtered = prev.filter((a) => !(a.scriptId === scriptId && a.part === part));
          const voice = voices.find((v) => v.id === selectedVoiceId);
          return [
            ...filtered,
            {
              id: result.id,
              scriptId,
              part,
              storagePath: result.storagePath,
              mimeType: "audio/mpeg",
              sizeBytes: result.sizeBytes,
              durationMs: result.durationMs,
              voiceId: selectedVoiceId,
              voiceName: result.voiceName || voice?.name,
              providerName: result.providerName,
              costUsd: result.costUsd,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyPart(null);
      }
    });
  };

  const generateAll = () => {
    setError(null);
    setBusyPart("full");
    startTransition(async () => {
      try {
        const voice = voices.find((v) => v.id === selectedVoiceId);
        await generateAllAudioAction(scriptId, selectedVoiceId, voice?.name, speed);
        // refresh — easier: navigate or fetch. We'll trigger a soft reload by re-running list.
        const v = await listVoicesAction();
        setVoices(v);
        // Re-render by fetching from page? Skip — server revalidation should kick in.
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyPart(null);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Xóa audio này?")) return;
    startTransition(async () => {
      await deleteAudioAction(id, scriptId);
      setAudios((prev) => prev.filter((a) => a.id !== id));
    });
  };

  const parts: AudioPart[] = ["full", "broll", "animation", "hook", "body", "cta"];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 text-purple-600">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Voice Studio</h3>
              <p className="text-xs text-muted-foreground">
                Sinh audio cho 3 concept. Provider: <strong>{voices[0]?.providerName || "—"}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {voices.length > 0 ? (
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.gender ? `(${v.gender})` : ""} — {v.lang}
                  </option>
                ))}
              </select>
            ) : (
              <Badge variant="warning">Chưa có TTS provider</Badge>
            )}
            <Button variant="accent" size="sm" onClick={generateAll} disabled={isPending}>
              {isPending && busyPart === "full" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Sinh hết 3 concept
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-zinc-50/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-purple-600" />
              Tốc độ đọc
            </span>
            <span className="font-mono text-purple-700">{speed.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.7}
            max={2.0}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-purple-600"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1.0 chuẩn</span>
            <span>1.2 nhanh (native)</span>
            <span>1.5 cuốn</span>
            <span>2.0 rất nhanh</span>
          </div>
          <p className="text-[10px] text-muted-foreground">&gt;1.2 tăng tốc qua VPS (giữ cao độ, không &quot;giọng vịt&quot;).</p>
        </div>

        {!hasTTSProvider && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">Chưa có TTS provider</p>
              <p className="text-xs text-amber-800 mt-1">
                Đang dùng mock (audio MP3 im lặng). Vào <a href="/settings/integrations" className="underline">Integrations</a> thêm <strong>ElevenLabs</strong> (free 10k chars, dùng Voice ID giọng Việt) để có audio thật.
              </p>
            </div>
          </div>
        )}

        {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          {parts.slice(0, 3).map((part) => (
            <AudioCard
              key={part}
              part={part}
              record={audioByPart(part)}
              busy={isPending && busyPart === part}
              onGenerate={() => generate(part)}
              onDelete={(id) => handleDelete(id)}
              primary
            />
          ))}
        </div>

        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground py-2 flex items-center gap-1">
            <Volume2 className="h-3 w-3" />
            Sinh audio riêng cho từng đoạn (advanced)
          </summary>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {parts.slice(3).map((part) => (
              <AudioCard
                key={part}
                part={part}
                record={audioByPart(part)}
                busy={isPending && busyPart === part}
                onGenerate={() => generate(part)}
                onDelete={(id) => handleDelete(id)}
              />
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function AudioCard({
  part,
  record,
  busy,
  onGenerate,
  onDelete,
  primary,
}: {
  part: AudioPart;
  record?: AudioRecord;
  busy: boolean;
  onGenerate: () => void;
  onDelete: (id: string) => void;
  primary?: boolean;
}) {
  return (
    <div className={`rounded-md border ${primary ? "border-border" : "border-zinc-200 bg-zinc-50/50"} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <Badge variant={PART_COLOR[part]} className="text-[10px]">
          {PART_LABEL[part]}
        </Badge>
        {record && (
          <span className="text-[10px] text-muted-foreground">
            {(record.durationMs / 1000).toFixed(1)}s · {(record.sizeBytes / 1024).toFixed(1)}KB
          </span>
        )}
      </div>

      {record ? (
        <>
          <audio src={record.storagePath} controls className="w-full" preload="metadata" />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {record.providerName} · {record.voiceName || record.voiceId}
            </span>
            <span>${record.costUsd.toFixed(4)}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={onGenerate} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Re-gen
            </Button>
            <a href={record.storagePath} download className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-7 text-[10px]">
                <Download className="h-3 w-3" />
              </Button>
            </a>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => onDelete(record.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      ) : (
        <Button variant="accent" size="sm" className="w-full" onClick={onGenerate} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
          Generate
        </Button>
      )}
    </div>
  );
}
