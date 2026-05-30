"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Image as ImageIcon, Sparkles, Loader2, XCircle } from "lucide-react";
import { previewImageAction } from "@/lib/integration-hub/image-actions";

const SAMPLE_PROMPT =
  "Banner dọc 9:16: dòng chữ tiếng Việt 'BẠN ĐANG VÔ HÌNH', nền tối điện ảnh, phong cách minimal";

export function ImagePreviewDialog() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [result, setResult] = useState<{ dataUrl?: string; costUsd?: number; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    setResult(null);
    startTransition(async () => {
      const r = await previewImageAction(prompt);
      setResult(r.ok ? { dataUrl: r.dataUrl, costUsd: r.costUsd } : { error: r.error });
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ImageIcon className="h-4 w-4" /> Preview ảnh AI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview ảnh AI</DialogTitle>
            <DialogDescription>
              Sinh thử 1 ảnh từ image provider mặc định để đánh giá chất lượng (tốn phí API, ảnh không được lưu).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Mô tả ảnh cần sinh..."
            />
            <Button variant="accent" className="w-full" onClick={handleGenerate} disabled={isPending || !prompt.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isPending ? "Đang sinh ảnh..." : "Sinh ảnh"}
            </Button>

            {result?.error && (
              <div className="rounded-md bg-rose-50 p-3 flex items-center gap-2 text-sm text-rose-700">
                <XCircle className="h-4 w-4 shrink-0" /> {result.error}
              </div>
            )}
            {result?.dataUrl && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.dataUrl}
                  alt="Ảnh preview"
                  className="w-full rounded-md border border-border max-h-[55vh] object-contain bg-muted"
                />
                <p className="text-xs text-muted-foreground text-right">
                  Cost ~${(result.costUsd ?? 0).toFixed(4)}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
