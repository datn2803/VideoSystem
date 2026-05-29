"use client";
import { useState, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Loader2, X, FileVideo } from "lucide-react";
import { uploadFootageAction } from "@/lib/footage/actions";
import type { FootageTag } from "@/lib/footage/storage";

type Profile = { id: string; name: string };

type PendingFile = {
  file: File;
  tag: FootageTag;
  notes: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const TAG_OPTIONS: { value: FootageTag; label: string; hint: string }[] = [
  { value: "intro", label: "Intro", hint: "Mở đầu, giới thiệu" },
  { value: "talking", label: "Talking", hint: "Cận mặt, nói trực tiếp" },
  { value: "broll", label: "B-roll", hint: "Cảnh bối cảnh, môi trường" },
  { value: "cta", label: "CTA", hint: "Mời follow, like, share" },
  { value: "outro", label: "Outro", hint: "Kết thúc, logo" },
  { value: "other", label: "Khác", hint: "Chưa phân loại" },
];

export function FootageUploadForm({ profiles, defaultProfileId }: { profiles: Profile[]; defaultProfileId: string }) {
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: PendingFile[] = Array.from(files).map((f) => ({
      file: f,
      tag: guessTag(f.name),
      notes: "",
      status: "pending",
    }));
    setQueue((q) => [...q, ...newItems]);
  };

  const uploadAll = () => {
    if (!profileId) {
      alert("Cần chọn profile trước");
      return;
    }
    startTransition(async () => {
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status !== "pending") continue;
        setQueue((q) => q.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
        const fd = new FormData();
        fd.append("file", queue[i].file);
        fd.append("tag", queue[i].tag);
        fd.append("notes", queue[i].notes);
        fd.append("profileId", profileId);
        const result = await uploadFootageAction(fd);
        setQueue((q) =>
          q.map((x, j) =>
            j === i
              ? {
                  ...x,
                  status: result.ok ? "done" : "error",
                  error: result.ok ? undefined : result.error,
                }
              : x
          )
        );
      }
    });
  };

  const clearDone = () => setQueue((q) => q.filter((x) => x.status !== "done"));
  const removeAt = (i: number) => setQueue((q) => q.filter((_, j) => j !== i));

  return (
    <div className="space-y-4">
      {profiles.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm">
            <span className="font-medium">⚠️ Chưa có profile.</span> Vào{" "}
            <a href="/profiles" className="text-accent underline">
              /profiles
            </a>{" "}
            tạo trước.
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Profile:</label>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1 max-w-xs"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Card
        className="border-dashed border-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <CardContent className="py-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Kéo thả video vào đây, hoặc click để chọn</p>
            <p className="text-xs text-muted-foreground">MP4, MOV, WebM, M4V — tối đa 500MB/file</p>
          </div>
        </CardContent>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Hàng đợi upload ({queue.length}) — {queue.filter((x) => x.status === "done").length} xong
              </p>
              <div className="flex gap-2">
                {queue.some((x) => x.status === "done") && (
                  <Button variant="outline" size="sm" onClick={clearDone}>
                    Xóa đã xong
                  </Button>
                )}
                <Button
                  variant="accent"
                  size="sm"
                  onClick={uploadAll}
                  disabled={isPending || !queue.some((x) => x.status === "pending")}
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {isPending ? "Đang upload..." : "Upload tất cả"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {queue.map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border p-2">
                  <FileVideo className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <select
                    value={item.tag}
                    disabled={item.status !== "pending"}
                    onChange={(e) =>
                      setQueue((q) => q.map((x, j) => (j === i ? { ...x, tag: e.target.value as FootageTag } : x)))
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {TAG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] w-20 text-right">
                    {item.status === "done" && <span className="text-emerald-600">✓ Xong</span>}
                    {item.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    {item.status === "error" && <span className="text-rose-600">✗ Lỗi</span>}
                    {item.status === "pending" && <span className="text-muted-foreground">Chờ</span>}
                  </span>
                  {item.status === "pending" && (
                    <button onClick={() => removeAt(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function guessTag(filename: string): FootageTag {
  const n = filename.toLowerCase();
  if (n.includes("intro") || n.includes("open")) return "intro";
  if (n.includes("talk") || n.includes("chân") || n.includes("chân dung")) return "talking";
  if (n.includes("broll") || n.includes("b-roll")) return "broll";
  if (n.includes("cta") || n.includes("call")) return "cta";
  if (n.includes("outro") || n.includes("end")) return "outro";
  return "other";
}
