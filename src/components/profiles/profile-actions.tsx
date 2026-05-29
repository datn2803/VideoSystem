"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { generateSampleScriptAction, deleteProfileAction } from "@/lib/profiles/actions";

export function GenerateSampleButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ text: string; costUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setOpen(true);
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const r = await generateSampleScriptAction(profileId);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <>
      <Button variant="accent" size="sm" className="flex-1" onClick={handleClick}>
        <Sparkles className="h-3 w-3" /> Sample script
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Sample script</DialogTitle>
            <DialogDescription>
              Demo nhanh phong cách video từ profile này. Nếu chưa có LLM provider, sẽ dùng mock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang sinh script bằng LLM...
              </div>
            )}
            {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            {result && (
              <>
                <div className="rounded-md border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
                  {result.text}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Cost: ${result.costUsd.toFixed(4)}</span>
                  <Badge variant="success" className="text-[10px]">Generated</Badge>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
