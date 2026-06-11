"use client";
/**
 * Nhạc nền MiniMax (Phase 5, tuỳ chọn): sinh 1 track instrumental theo chủ đề →
 * builder tự mix duck -18dB dưới giọng khi render C2/C3. Gate cost-guard ở server.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Music, Trash2 } from "lucide-react";
import { deleteMusicAction, generateMusicAction } from "@/lib/audio/music-actions";

export function MusicStudio({
  scriptId,
  initialMusicUrl,
  renderMode,
}: {
  scriptId: string;
  initialMusicUrl: string | null;
  renderMode: string;
}) {
  const [musicUrl, setMusicUrl] = useState(initialMusicUrl);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const gen = () =>
    startTransition(async () => {
      setError("");
      const r = await generateMusicAction(scriptId);
      if ("error" in r && r.error) setError(r.error);
      else if ("storagePath" in r) setMusicUrl(r.storagePath ?? null);
    });

  const del = () =>
    startTransition(async () => {
      await deleteMusicAction(scriptId);
      setMusicUrl(null);
    });

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Music className="h-4 w-4 text-accent" /> Nhạc nền (MiniMax)
          <Badge variant="outline" className="text-[9px]">tuỳ chọn · duck -18dB dưới giọng</Badge>
        </div>
        <div className="flex gap-2">
          {musicUrl && (
            <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={isPending} onClick={del}>
              <Trash2 className="h-3 w-3" /> Bỏ nhạc
            </Button>
          )}
          <Button variant="accent" size="sm" disabled={isPending} onClick={gen}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music className="h-3.5 w-3.5" />}
            {musicUrl ? "Sinh lại" : "Sinh nhạc nền"}
          </Button>
        </div>
      </div>
      {musicUrl && <audio controls src={musicUrl} className="w-full h-9" />}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {renderMode !== "live" && !musicUrl && (
        <p className="text-[10px] text-muted-foreground">Cần RENDER_MODE=live + MINIMAX_API_KEY (trả phí — gate cost-guard).</p>
      )}
    </div>
  );
}
