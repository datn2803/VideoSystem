"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Compass, Loader2, Pencil, Plus, RefreshCw, Target, Trash2 } from "lucide-react";
import { regenerateStrategyAction, updateStrategyAction } from "@/lib/profiles/actions";
import type { ContentPillar, ProfileStrategy } from "@/lib/integration-hub/storage";

export function ProfileStrategyPanel({ profileId, strategy }: { profileId: string; strategy?: ProfileStrategy }) {
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const regenerate = () => {
    if (strategy && !confirm("Tạo lại toàn bộ trụ nội dung? Trụ hiện tại sẽ bị thay thế.")) return;
    startTransition(async () => {
      await regenerateStrategyAction(profileId);
    });
  };

  if (!strategy || strategy.pillars.length === 0) {
    return (
      <div className="pt-2 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" /> Chiến lược nội dung
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Chưa có trụ nội dung.</p>
        <Button variant="outline" size="sm" onClick={regenerate} disabled={isPending} className="w-full">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Compass className="h-3 w-3" />}
          {isPending ? "Đang tạo trụ..." : "Tạo trụ nội dung"}
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-border space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5" /> Chiến lược nội dung
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditOpen(true)} disabled={isPending}>
            <Pencil className="h-3 w-3" /> Sửa
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={regenerate} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Tạo lại
          </Button>
        </div>
      </div>

      {strategy.brandAngle && (
        <div className="flex items-start gap-2 text-sm">
          <Target className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
          <span className="text-foreground/90 italic">"{strategy.brandAngle}"</span>
        </div>
      )}
      {strategy.channelGoal && (
        <Badge variant="outline" className="text-[11px]">Mục tiêu: {strategy.channelGoal}</Badge>
      )}

      <div className="space-y-2">
        {strategy.pillars.map((p, i) => (
          <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-medium">{p.name}</span>
            </div>
            {p.description && <p className="text-xs text-muted-foreground pl-7">{p.description}</p>}
            {p.sampleAngles.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-7">
                {p.sampleAngles.map((a, j) => (
                  <span key={j} className="text-[10px] rounded bg-background px-1.5 py-0.5 text-muted-foreground border border-border">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <StrategyEditDialog
        profileId={profileId}
        strategy={strategy}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function StrategyEditDialog({
  profileId,
  strategy,
  open,
  onOpenChange,
}: {
  profileId: string;
  strategy: ProfileStrategy;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [brandAngle, setBrandAngle] = useState(strategy.brandAngle);
  const [channelGoal, setChannelGoal] = useState(strategy.channelGoal);
  // Lưu painPoints/sampleAngles dạng text nhiều dòng cho dễ sửa, convert lúc save.
  const [pillars, setPillars] = useState(
    strategy.pillars.map((p) => ({
      name: p.name,
      description: p.description,
      painPoints: p.painPoints.join("\n"),
      sampleAngles: p.sampleAngles.join("\n"),
    }))
  );

  const updatePillar = (i: number, patch: Partial<(typeof pillars)[number]>) =>
    setPillars((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removePillar = (i: number) => setPillars((prev) => prev.filter((_, idx) => idx !== i));
  const addPillar = () => setPillars((prev) => [...prev, { name: "", description: "", painPoints: "", sampleAngles: "" }]);

  const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = () => {
    const cleaned: ProfileStrategy = {
      brandAngle: brandAngle.trim(),
      channelGoal: channelGoal.trim() || "uy tín",
      generatedAt: strategy.generatedAt,
      pillars: pillars
        .filter((p) => p.name.trim())
        .map<ContentPillar>((p) => ({
          name: p.name.trim(),
          description: p.description.trim(),
          painPoints: splitLines(p.painPoints),
          sampleAngles: splitLines(p.sampleAngles),
        })),
    };
    startTransition(async () => {
      await updateStrategyAction(profileId, cleaned);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sửa chiến lược nội dung</DialogTitle>
          <DialogDescription>Chỉnh tay định vị + các trụ. Đây là nguồn để Planner sinh chủ đề.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Brand angle (định vị)</label>
            <Textarea value={brandAngle} onChange={(e) => setBrandAngle(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Mục tiêu kênh</label>
            <Input value={channelGoal} onChange={(e) => setChannelGoal(e.target.value)} placeholder="uy tín / lead / bán" />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium">Trụ nội dung ({pillars.length})</span>
            <Button variant="outline" size="sm" onClick={addPillar} className="h-7">
              <Plus className="h-3 w-3" /> Thêm trụ
            </Button>
          </div>

          {pillars.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Trụ {i + 1}</span>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-destructive" onClick={() => removePillar(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input value={p.name} onChange={(e) => updatePillar(i, { name: e.target.value })} placeholder="Tên trụ ≤6 từ" />
              <Input value={p.description} onChange={(e) => updatePillar(i, { description: e.target.value })} placeholder="Mô tả 1 câu" />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Pain points (mỗi dòng 1)</label>
                  <Textarea value={p.painPoints} onChange={(e) => updatePillar(i, { painPoints: e.target.value })} rows={2} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Góc khai thác (mỗi dòng 1)</label>
                  <Textarea value={p.sampleAngles} onChange={(e) => updatePillar(i, { sampleAngles: e.target.value })} rows={2} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button variant="accent" onClick={save} disabled={isPending || pillars.every((p) => !p.name.trim())}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
