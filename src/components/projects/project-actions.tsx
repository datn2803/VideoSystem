"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/lib/projects/actions";

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Xóa project "${name}"? (scripts đã tạo vẫn còn)`)) return;
        startTransition(async () => {
          await deleteProjectAction(projectId);
        });
      }}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
    </Button>
  );
}
