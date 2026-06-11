"use client";
/**
 * Scene Studio (Phase 4) — sửa storyboard TRỰC QUAN, không đụng code:
 * mỗi cảnh 1 hàng: preview iframe srcdoc (dựng theo BrandKit tokens) + sửa
 * chữ/số/thời lượng + đổi thứ tự + re-render RIÊNG cảnh đó (engine $0).
 * Lưu = updateStoryboardAction (sanitize + validate + anti-fab ở server).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Clapperboard, Film, Loader2, Save } from "lucide-react";
import type { ContentGraph, Node as GraphNode } from "@/lib/content-graph";
import type { BrandTokens } from "@/lib/design/brandkit";
import {
  pollSceneRenderAction,
  renderSceneAction,
  updateStoryboardAction,
} from "@/lib/scripts/actions";

type NodeDraft = GraphNode & { _dirty?: boolean };

/** HTML mini-preview 1 cảnh (iframe srcdoc) — màu/chữ từ BrandKit, tỉ lệ 9:16. */
function scenePreviewHtml(n: GraphNode, t: BrandTokens | null): string {
  const bg1 = t?.bg1 || "#f4f0fc", bg2 = t?.bg2 || "#e9e3f8", ink = t?.ink || "#1e1b2e",
    sub = t?.sub || "#6b6480", accent = t?.accent || "#7c3aed", accent2 = t?.accent2 || "#a78bfa",
    card = t?.card || "#ffffff";
  const d = n.kind === "data" && n.data && typeof n.data === "object" && !Array.isArray(n.data)
    ? (n.data as Record<string, unknown>) : {};
  const text = n.kind === "text" ? n.text : "";
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body =
    n.kind === "data"
      ? `<div class="card"><div class="big">${esc(d.value)}<span class="u">${esc(d.unit)}</span></div><div class="lb">${esc(d.label || n.label || "")}</div></div>`
      : (n.frameIntent === "hook" || n.frameIntent === "outro")
        ? `<div class="hk" style="color:${n.frameIntent === "hook" ? accent : ink}">${esc(text)}</div>`
        : `<div class="card left"><div class="tt">${esc(text)}</div></div>`;
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:270px;height:480px;overflow:hidden;font-family:'Be Vietnam Pro',system-ui,sans-serif}
    body{background:linear-gradient(165deg,${bg1},${bg2});display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
    .eb{position:absolute;top:12px;left:14px;font-size:8px;font-weight:800;letter-spacing:1px;color:${sub};text-transform:uppercase}
    .card{background:${card};border:1px solid rgba(127,127,127,.15);border-radius:12px;padding:20px 16px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,.18);text-align:center}
    .card.left{text-align:left}
    .big{font-weight:900;font-size:44px;color:${accent};line-height:1}
    .big .u{font-size:16px;color:${accent2};vertical-align:top}
    .lb{margin-top:8px;font-size:10px;font-weight:700;color:${sub};text-transform:uppercase}
    .tt{font-size:15px;font-weight:800;color:${ink};line-height:1.3}
    .hk{font-size:20px;font-weight:900;text-align:center;line-height:1.25}
  </style></head><body><span class="eb">${esc(n.frameIntent || n.kind)}</span>${body}</body></html>`;
}

export function SceneStudio({
  scriptId,
  storyboard,
  tokens,
}: {
  scriptId: string;
  storyboard: ContentGraph | null;
  tokens: BrandTokens | null;
}) {
  const [nodes, setNodes] = useState<NodeDraft[]>(storyboard?.nodes ? [...storyboard.nodes] : []);
  const [msg, setMsg] = useState<string>("");
  const [previews, setPreviews] = useState<Record<string, { status: string; url?: string }>>({});
  const [isPending, startTransition] = useTransition();
  const pollTimer = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const dirty = useMemo(() => nodes.some((n) => n._dirty), [nodes]);

  // Rời trang giữa lúc render cảnh → dọn mọi interval poll (không chạy nền vô chủ).
  useEffect(() => {
    const timers = pollTimer.current;
    return () => Object.values(timers).forEach((t) => clearInterval(t));
  }, []);

  if (!storyboard || nodes.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Clapperboard className="h-4 w-4" />
        Script này chưa có storyboard (sinh từ bản cũ). Tạo script mới để có storyboard sửa được từng cảnh.
      </div>
    );
  }

  const patch = (i: number, p: Partial<GraphNode> & { data?: unknown }) =>
    setNodes((prev) => prev.map((n, j) => (j === i ? ({ ...n, ...p, _dirty: true } as NodeDraft) : n)));

  const move = (i: number, dir: -1 | 1) =>
    setNodes((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      next[i] = { ...next[i], _dirty: true };
      return next;
    });

  const save = () =>
    startTransition(async () => {
      setMsg("");
      // Thứ tự mới → nối lại edges sequence (đúng quy ước storyboard Phase 1).
      const clean = nodes.map((n) => {
        const rest = { ...n };
        delete (rest as NodeDraft)._dirty;
        return rest as GraphNode;
      });
      const graph: ContentGraph = {
        schemaVersion: 1,
        intent: storyboard.intent,
        synopsis: storyboard.synopsis,
        nodes: clean,
        edges: clean.slice(0, -1).map((n, i) => ({ from: n.id, to: clean[i + 1].id, kind: "sequence" as const })),
      };
      const r = await updateStoryboardAction(scriptId, graph);
      if ("error" in r && r.error) setMsg(`❌ ${r.error}`);
      else {
        setNodes((prev) => prev.map((n) => ({ ...n, _dirty: false })));
        setMsg("✅ Đã lưu storyboard");
      }
    });

  const renderScene = (nodeId: string) =>
    startTransition(async () => {
      setPreviews((p) => ({ ...p, [nodeId]: { status: "queued" } }));
      const r = await renderSceneAction(scriptId, nodeId);
      if ("error" in r && r.error) {
        setPreviews((p) => ({ ...p, [nodeId]: { status: `lỗi: ${r.error}` } }));
        return;
      }
      const jobId = (r as { jobId: string }).jobId;
      if (pollTimer.current[nodeId]) clearInterval(pollTimer.current[nodeId]);
      pollTimer.current[nodeId] = setInterval(async () => {
        const s = await pollSceneRenderAction(jobId);
        if (s.status === "done" && s.outputUrl) {
          clearInterval(pollTimer.current[nodeId]);
          setPreviews((p) => ({ ...p, [nodeId]: { status: "done", url: s.outputUrl } }));
        } else if (s.status === "failed") {
          clearInterval(pollTimer.current[nodeId]);
          setPreviews((p) => ({ ...p, [nodeId]: { status: `lỗi: ${s.error || "render fail"}` } }));
        } else {
          setPreviews((p) => ({ ...p, [nodeId]: { status: "đang render…" } }));
        }
      }, 4000);
    });

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Scene Studio</h3>
          <Badge variant="outline" className="text-[9px]">{nodes.length} cảnh · {storyboard.intent}</Badge>
          {/* P2.2 (UX honesty): storyboard hiện CHƯA điều khiển video chính */}
          <Badge variant="warning" className="text-[9px]">preview cảnh lẻ — video chính vẫn dựng từ kịch bản gốc</Badge>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
          <Button size="sm" variant="accent" onClick={save} disabled={!dirty || isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lưu storyboard
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {nodes.map((n, i) => {
          const d = n.kind === "data" && n.data && typeof n.data === "object" && !Array.isArray(n.data)
            ? (n.data as Record<string, string>) : null;
          const pv = previews[n.id];
          return (
            <div key={n.id} className="p-4 flex gap-4 items-start">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === nodes.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>

              <iframe
                title={`preview-${n.id}`}
                sandbox=""
                srcDoc={scenePreviewHtml(n, tokens)}
                className="w-[135px] h-[240px] rounded-lg border border-border shrink-0 pointer-events-none"
              />

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="accent" className="text-[9px]">{n.frameIntent || n.kind}</Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{n.id}</span>
                  <label className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                    Thời lượng
                    <input
                      type="number" min={1} max={15} step={0.5}
                      className="w-16 h-7 rounded-md border border-input bg-background px-2 text-[11px]"
                      value={n.durationSec ?? 3}
                      onChange={(e) => patch(i, { durationSec: Number(e.target.value) || 3 })}
                    />
                    giây
                  </label>
                </div>

                {n.kind === "text" ? (
                  <textarea
                    className="w-full rounded-md border border-input bg-background p-2 text-xs min-h-[56px]"
                    value={n.text}
                    onChange={(e) => patch(i, { text: e.target.value } as Partial<GraphNode>)}
                  />
                ) : d ? (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[10px] text-muted-foreground space-y-1">Giá trị
                      <input className="w-full h-7 rounded-md border border-input bg-background px-2 text-[11px]" value={d.value || ""}
                        onChange={(e) => patch(i, { data: { ...d, value: e.target.value } })} />
                    </label>
                    <label className="text-[10px] text-muted-foreground space-y-1">Đơn vị
                      <input className="w-full h-7 rounded-md border border-input bg-background px-2 text-[11px]" value={d.unit || ""}
                        onChange={(e) => patch(i, { data: { ...d, unit: e.target.value } })} />
                    </label>
                    <label className="text-[10px] text-muted-foreground space-y-1">Nhãn
                      <input className="w-full h-7 rounded-md border border-input bg-background px-2 text-[11px]" value={d.label || ""}
                        onChange={(e) => patch(i, { data: { ...d, label: e.target.value } })} />
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">({n.kind})</p>
                )}

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={isPending} onClick={() => renderScene(n.id)}>
                    <Film className="h-3 w-3" /> Render cảnh này
                  </Button>
                  {pv?.status && pv.status !== "done" && <span className="text-[10px] text-muted-foreground">{pv.status}</span>}
                </div>
                {pv?.url && (
                  <video src={pv.url} controls className="w-[160px] rounded-lg border border-border" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
