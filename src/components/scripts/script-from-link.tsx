"use client";
/**
 * "Dán link/bài → video" (Phase 4): URL bài viết/GitHub → fetch (chặn SSRF) →
 * Markdown → Scripter sinh script (bài làm source brief) → điều hướng sang script.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, Loader2 } from "lucide-react";
import { createScriptFromLinkAction } from "@/lib/scripts/actions";

export function ScriptFromLink({ profiles }: { profiles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (profiles.length === 0) return null;

  const go = () =>
    startTransition(async () => {
      setError("");
      const r = await createScriptFromLinkAction({ profileId, url: url.trim() });
      if ("error" in r && r.error) setError(r.error);
      else if ("id" in r && r.id) router.push(`/scripts/${r.id}`);
    });

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4 text-accent" /> Dán link / bài → video
      </div>
      <div className="flex gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-xs w-44 shrink-0"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-xs"
          placeholder="https://bài-viết-hoặc-github-repo…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button variant="accent" size="sm" disabled={isPending || !/^https?:\/\//.test(url.trim())} onClick={go}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isPending ? "Đang đọc + viết script…" : "Tạo script"}
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        Bài được fetch server-side (chặn SSRF), số liệu trong bài coi như có nguồn — vẫn qua Auditor như mọi script.
      </p>
    </div>
  );
}
