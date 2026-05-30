"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Pencil, Loader2 } from "lucide-react";
import { regeneratePlanAction, renameProjectAction } from "@/lib/projects/actions";

export function ProjectControls({
  projectId,
  topicCount,
}: {
  projectId: string;
  topicCount: number;
}) {
  const [n, setN] = useState(topicCount || 12);
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"regen" | "rename" | null>(null);

  const handleRegen = () => {
    if (!confirm(`Sinh lại plan (${n} chủ đề)? Topics cũ sẽ bị thay; scripts đã tạo vẫn còn.`)) return;
    setMode("regen");
    startTransition(async () => {
      await regeneratePlanAction(projectId, n);
      setMode(null);
    });
  };

  const handleRename = () => {
    const name = prompt("Tên project mới:");
    if (!name) return;
    setMode("rename");
    startTransition(async () => {
      await renameProjectAction(projectId, name);
      setMode(null);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={n}
        onChange={(e) => setN(parseInt(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        disabled={isPending}
      >
        <option value={6}>6</option>
        <option value={9}>9</option>
        <option value={12}>12</option>
        <option value={20}>20</option>
      </select>
      <Button variant="outline" size="sm" onClick={handleRegen} disabled={isPending}>
        {isPending && mode === "regen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sinh lại plan
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRename} disabled={isPending}>
        {isPending && mode === "rename" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
        Đổi tên
      </Button>
    </div>
  );
}
