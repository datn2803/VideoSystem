"use client";
import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { deleteProfileAction } from "@/lib/profiles/actions";

// Thay nút "Sample script" (cũ chỉ mở popup preview, ngõ cụt) bằng "Tạo plan":
// dẫn thẳng vào pipeline — mở modal tạo project với profile chọn sẵn.
// (Logic preview cũ + generateSampleScriptAction đã bỏ; server action vẫn còn nếu cần dùng lại.)
export function CreatePlanButton({ profileId }: { profileId: string }) {
  return (
    <Link href={`/projects?new=1&profile=${profileId}`} className="flex-1">
      <Button variant="accent" size="sm" className="w-full">
        <Sparkles className="h-3 w-3" /> Tạo plan
      </Button>
    </Link>
  );
}

export function DeleteProfileButton({ profileId, name }: { profileId: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (!confirm(`Xóa profile "${name}"?`)) return;
        startTransition(async () => {
          await deleteProfileAction(profileId);
        });
      }}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
    </Button>
  );
}
