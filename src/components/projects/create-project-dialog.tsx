"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { createProjectWithPlanAction } from "@/lib/projects/actions";

type Profile = { id: string; name: string; role: string };

export function CreateProjectDialog({
  profiles,
  autoOpen = false,
  initialProfileId,
  triggerLabel = "Tạo project mới",
  triggerVariant = "accent",
}: {
  profiles: Profile[];
  autoOpen?: boolean;
  initialProfileId?: string;
  triggerLabel?: string;
  triggerVariant?: "accent" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState(initialProfileId || profiles[0]?.id || "");
  const [n, setN] = useState(12);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Deep-link ?new=1 → tự mở modal
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  // Khi có ?profile=<id> truyền vào → preselect
  useEffect(() => {
    if (initialProfileId) setProfileId(initialProfileId);
  }, [initialProfileId]);

  const handleCreate = () => {
    if (!profileId) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await createProjectWithPlanAction(profileId, n, name || undefined);
        router.push(`/projects/${r.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo project mới</DialogTitle>
            <DialogDescription>
              AI Planner sinh content plan từ profile (Gemini free — không tốn phí). Plan được lưu lại trong project.
            </DialogDescription>
          </DialogHeader>

          {profiles.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center space-y-2">
              <AlertCircle className="h-7 w-7 mx-auto text-amber-500" />
              <p className="text-sm font-medium">Cần tạo profile trước</p>
              <Link href="/profiles" className="text-sm text-accent hover:underline">
                → Sang /profiles để tạo profile
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Profile</label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value={6}>6 chủ đề</option>
                  <option value={9}>9 chủ đề</option>
                  <option value={12}>12 chủ đề</option>
                  <option value={20}>20 chủ đề</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Tên project (tùy chọn)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Để trống = tự đặt theo profile + ngày"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                  <p className="text-xs mt-1 text-rose-600">
                    Tip: cần 1 LLM provider — vào /settings/integrations thêm Gemini (free) hoặc Claude.
                  </p>
                </div>
              )}

              <Button variant="accent" className="w-full" onClick={handleCreate} disabled={isPending || !profileId}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isPending ? "AI đang sinh plan..." : "Tạo project & sinh plan"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
