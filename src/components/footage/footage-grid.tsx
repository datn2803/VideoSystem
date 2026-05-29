"use client";
import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Play, Pause, Loader2 } from "lucide-react";
import { deleteFootageAction, updateFootageTagAction } from "@/lib/footage/actions";
import type { FootageAsset, FootageTag } from "@/lib/footage/storage";

const tagColors: Record<string, "default" | "accent" | "success" | "warning" | "secondary" | "outline"> = {
  intro: "accent",
  talking: "default",
  broll: "success",
  cta: "warning",
  outro: "secondary",
  other: "outline",
};

const TAG_OPTIONS: FootageTag[] = ["intro", "talking", "broll", "cta", "outro", "other"];

export function FootageGrid({ assets }: { assets: FootageAsset[] }) {
  const [filter, setFilter] = useState<FootageTag | "all">("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = filter === "all" ? assets : assets.filter((a) => a.tag === filter);
  const counts: Record<string, number> = {};
  for (const a of assets) counts[a.tag] = (counts[a.tag] || 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
          Tất cả <span className="ml-1 text-xs opacity-60">{assets.length}</span>
        </Button>
        {TAG_OPTIONS.map((t) => (
          <Button
            key={t}
            variant={filter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(t)}
            className="capitalize"
          >
            {t} <span className="ml-1 text-xs opacity-60">{counts[t] || 0}</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {assets.length === 0 ? "Chưa có footage nào. Upload bên trên." : "Không có footage trong tag này."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {filtered.map((a) => (
            <FootageCard
              key={a.id}
              asset={a}
              isPlaying={playingId === a.id}
              onPlayToggle={() => setPlayingId((id) => (id === a.id ? null : a.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FootageCard({
  asset,
  isPlaying,
  onPlayToggle,
}: {
  asset: FootageAsset;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [tag, setTag] = useState(asset.tag);

  const handleDelete = () => {
    if (!confirm(`Xóa "${asset.filename}"?`)) return;
    startTransition(() => {
      deleteFootageAction(asset.id);
    });
  };

  const handleTagChange = (newTag: FootageTag) => {
    setTag(newTag);
    startTransition(() => {
      updateFootageTagAction(asset.id, newTag);
    });
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-950">
        {isPlaying ? (
          <video src={asset.storagePath} controls autoPlay className="w-full h-full object-contain bg-black" />
        ) : (
          <button
            onClick={onPlayToggle}
            className="absolute inset-0 flex items-center justify-center group hover:bg-black/20 transition-colors"
          >
            <Play className="h-10 w-10 text-white/70 group-hover:text-white" />
          </button>
        )}
        {isPlaying && (
          <button
            onClick={onPlayToggle}
            className="absolute top-2 right-2 z-10 rounded-full bg-black/70 p-1.5 text-white"
          >
            <Pause className="h-3 w-3" />
          </button>
        )}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB
        </div>
      </div>
      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-medium line-clamp-1" title={asset.filename}>
          {asset.filename}
        </p>
        <div className="flex items-center justify-between gap-2">
          <select
            value={tag}
            disabled={isPending}
            onChange={(e) => handleTagChange(e.target.value as FootageTag)}
            className="h-6 rounded-md border border-input bg-background px-1 text-[10px] flex-1"
          >
            {TAG_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Badge variant={tagColors[tag] || "outline"} className="text-[9px]">
            {tag}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{new Date(asset.uploadedAt).toLocaleDateString("vi-VN")}</span>
          <button onClick={handleDelete} disabled={isPending} className="hover:text-rose-500">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
